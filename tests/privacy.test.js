import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { awardsFixture, eventPayload, teamPayload } from "./awards-fixture.mjs";
import { legalDetails } from "../server/legal.js";
import { CONSENT_TEXT, PRIVACY_VERSION, PRIVACY_SECTIONS } from "../shared/privacy.js";
import { LANGUAGES, translate } from "../shared/i18n/index.js";
import catalog from "../shared/i18n/catalog.json" with { type: "json" };

test("legal configuration exposes only validated public details, never fabricates an operator", () => {
  assert.deepEqual(legalDetails({}), { name: "", identifier: "", address: "", email: "", storageCountry: "" });
  const details = legalDetails({ IQLAND_LEGAL_NAME: " ТЕСТ ИП ", IQLAND_LEGAL_ID: "123456789012", IQLAND_PRIVACY_EMAIL: "privacy@example.test", IQLAND_ADMIN_PASSWORD: "PRIVATE" });
  assert.equal(details.name, "ТЕСТ ИП");
  assert.equal(details.email, "privacy@example.test");
  assert.ok(!JSON.stringify(details).includes("PRIVATE"));
  for (const env of [{ IQLAND_PRIVACY_EMAIL: "mailto:bad" }, { IQLAND_LEGAL_ID: "123" }]) assert.throws(() => legalDetails(env));
});

test("all privacy paragraphs and confirmation are translated into all five languages", () => {
  for (const text of [CONSENT_TEXT, ...PRIVACY_SECTIONS.flat()]) {
    for (const { code } of LANGUAGES) {
      assert.ok(translate(text, code).trim());
      if (code !== "ru") assert.ok(catalog[text]?.[code], code + ": " + text);
    }
  }
});

test("new registrations require current consent, store exact translated evidence atomically, preserve it on retry and restart", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const eventId = await api.create();
  const payload = teamPayload(eventId, { consentLanguage: "kk" });
  const request = (body = payload) => fetch(api.base + "/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "privacy-test-abcdefghijklmnop" }, body: JSON.stringify(body) });
  for (const body of [{ ...payload, privacyVersion: undefined }, { ...payload, privacyVersion: "old" }, { ...payload, consent: false }, { ...payload, consentLanguage: "invalid" }]) assert.equal((await request(body)).status, 400);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) n FROM registrations").get().n), 0);
  const res = await request(); assert.equal(res.status, 201); const receipt = await res.json();
  const evidence = api.withDb((db) => db.prepare("SELECT * FROM registration_consents WHERE registration_id=?").get(receipt.id));
  assert.equal(evidence.policy_version, PRIVACY_VERSION);
  assert.equal(evidence.language, "kk");
  assert.equal(evidence.confirmation, translate(CONSENT_TEXT, "kk"));
  assert.equal(JSON.parse(evidence.notice).sections[0][1], translate(PRIVACY_SECTIONS[0][1], "kk"));
  assert.equal(evidence.notice_hash, createHash("sha256").update(evidence.notice).digest("hex"));
  assert.ok(Math.abs(Date.now() - Date.parse(evidence.accepted_at)) < 60000);
  assert.ok(!JSON.stringify(evidence).includes("127.0.0.1"));
  await api.stop(); await api.start();
  assert.deepEqual(await (await request()).json(), receipt);
  assert.deepEqual(await (await request({ ...payload, consentLanguage: "en" })).json(), receipt);
  assert.deepEqual(api.withDb((db) => db.prepare("SELECT * FROM registration_consents WHERE registration_id=?").get(receipt.id)), evidence);
  const managed = await api.request("/manage", { cookie: api.director });
  assert.equal(managed.data.registrations[0].privacy_version, PRIVACY_VERSION);
  assert.equal(managed.data.registrations[0].consent_at, evidence.accepted_at);
  assert.equal((await api.request("/manage")).res.status, 401);
  const legal = await api.request("/legal");
  assert.equal(legal.data.privacyVersion, PRIVACY_VERSION);
  assert.equal(legal.res.headers.get("cache-control"), "no-store");
  assert.equal(legal.res.headers.get("referrer-policy"), "no-referrer");
  assert.match(legal.res.headers.get("x-robots-tag"), /noindex/);
});

test("a failed student write rolls back both the registration and its consent record", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const eventId = await api.create();
  api.withDb((db) => db.exec("CREATE TRIGGER fail_student BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT, 'test rollback'); END"));
  assert.equal((await api.request("/registrations", { method: "POST", body: teamPayload(eventId) })).res.status, 500);
  api.withDb((db) => {
    assert.equal(db.prepare("SELECT COUNT(*) n FROM registrations").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM registration_consents").get().n, 0);
  });
});

test("historical stored receipts can be recovered without inventing a versioned consent", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const eventId = await api.create();
  const payload = teamPayload(eventId);
  const id = (await api.request("/registrations", { method: "POST", body: payload })).data.id;
  const { privacyVersion, consentLanguage, ...old } = payload;
  const canonical = {
    eventId: old.eventId, center: old.center, city: old.city, teacher: old.teacher,
    email: old.email, phone: old.phone, teachers: [], note: "", consent: true, students: old.students,
  };
  const key = "legacy-privacy-receipt-abcdefghijklmnop";
  api.withDb((db) => {
    db.prepare("DELETE FROM registration_consents WHERE registration_id=?").run(id);
    db.prepare("INSERT INTO registration_requests VALUES(?,?,?,?)").run(key, createHash("sha256").update(JSON.stringify(canonical)).digest("hex"), id, JSON.stringify({ id, count: 1 }));
  });
  await api.stop(); await api.start();
  const retry = await fetch(api.base + "/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(old) });
  assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), { id, count: 1 });
  const refreshed = await fetch(api.base + "/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ ...old, privacyVersion: PRIVACY_VERSION, consentLanguage: "en" }) });
  assert.equal(refreshed.status, 201);
  assert.deepEqual(await refreshed.json(), { id, count: 1 });
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) n FROM registration_consents").get().n), 0);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) n FROM registrations").get().n), 1);
});

test("pausing registration blocks new data but retains staff access and saved receipt recovery", async (t) => {
  const environment = {};
  const api = await awardsFixture({ environment }); t.after(() => api.close());
  const eventId = await api.create();
  const body = teamPayload(eventId);
  const headers = { "Content-Type": "application/json", "Idempotency-Key": "pause-existing-abcdefghijklmnop" };
  const receipt = await (await fetch(api.base + "/api/registrations", { method: "POST", headers, body: JSON.stringify(body) })).json();
  environment.IQLAND_REGISTRATION_PAUSED = "true";
  await api.stop(); await api.start();
  assert.equal((await api.request("/legal")).data.registrationOpen, false);
  assert.equal((await api.request("/registrations", { method: "POST", body })).res.status, 503);
  assert.deepEqual(await (await fetch(api.base + "/api/registrations", { method: "POST", headers, body: JSON.stringify(body) })).json(), receipt);
  assert.equal((await api.request("/manage", { cookie: api.director })).res.status, 200);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) n FROM registrations").get().n), 1);
});

test("privacy CLI previews without mutation, securely exports and erases all application copies including award snapshots", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const eventId = await api.create(eventPayload());
  const send = async (center) => {
    const response = await fetch(api.base + "/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "privacy-cli-" + createHash("sha256").update(center).digest("hex") }, body: JSON.stringify(teamPayload(eventId, { center })) });
    assert.equal(response.status, 201); return (await response.json()).id;
  };
  const id = await send("Центр один"); const other = await send("Центр два");
  api.withDb((db) => db.prepare("INSERT INTO award_runs VALUES(?,?,?,?,?)").run(eventId, "hash", new Date().toISOString(), null, JSON.stringify([{ name: "Тестовый Ученик", registration: id }])));
  const cli = (...args) => spawnSync(process.execPath, ["server/privacy-cli.js", ...args], { env: { ...process.env, DATA_DIR: api.dir }, encoding: "utf8" });
  const preview = cli("erase", id);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /"dryRun": true/);
  assert.match(preview.stdout, /"awardSnapshotWillBeRemoved": true/);
  assert.ok(!preview.stdout.includes("Тестовый Ученик"));
  assert.equal(cli("erase", id, "--confirm", other).status, 1);
  const output = join(api.dir, "subject-export.json");
  assert.equal(cli("export", id, output).status, 0);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const copy = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(copy.students.length, 1);
  assert.equal(copy.consent.policy_version, PRIVACY_VERSION);
  assert.ok(!JSON.stringify(copy).includes("privacy-cli-"));
  assert.equal(cli("export", id, output).status, 1, "must not overwrite any existing file");
  assert.equal(cli("export", id, join(process.cwd(), "private-data.json")).status, 1);
  symlinkSync(process.cwd(), join(api.dir, "repository-link"), "dir");
  assert.equal(cli("export", id, join(api.dir, "repository-link", "private-data.json")).status, 1);
  assert.ok(!existsSync(join(process.cwd(), "private-data.json")));
  assert.equal(cli("review", "2025-02-31").status, 1);
  assert.equal(JSON.parse(cli("review", "2099-01-01").stdout).length, 2);
  assert.equal(JSON.parse(cli("review", "2000-01-01").stdout).length, 0);
  await api.stop();
  const erased = cli("erase", id, "--confirm", id);
  assert.equal(erased.status, 0, erased.stderr);
  api.withDb((db) => {
    for (const table of ["registration_consents", "registration_requests", "students"]) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE registration_id=?`).get(id).n, 0, table);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM entries").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM award_runs").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM registrations WHERE id=?").get(other).n, 1);
  });
  await api.start();
  assert.equal((await api.request("/manage", { cookie: api.director })).data.registrations.length, 1);
});
