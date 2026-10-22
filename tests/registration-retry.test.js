import test from "node:test";
import assert from "node:assert/strict";
import { awardsFixture, eventPayload, teamPayload } from "./awards-fixture.mjs";
test("retrying a 50-student registration returns the same receipt without duplicate pupils, including after restart and deadline changes", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const id = await api.create(eventPayload({ telegramUrl: "https://t.me/test_olympiad" }));
  const payload = teamPayload(id, { students: Array.from({ length: 50 }, (_, i) => ({ name: `ТЕСТ Ученик ${i}`, birth: "2015-03-15", grade: 5, subjects: ["Математика"] })) });
  const send = (body = payload, key = "team-test-abcdefghijklmnopqrstuvwxyz") => fetch(api.base + "/api/registrations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
  const responses = await Promise.all([send(), send(), send()]);
  assert.ok(responses.every((r) => r.status === 201));
  const receipts = await Promise.all(responses.map((r) => r.json()));
  assert.deepEqual(receipts[0], receipts[1]); assert.deepEqual(receipts[1], receipts[2]);
  assert.equal(receipts[0].count, 50);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) AS count FROM registrations").get().count), 1);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) AS count FROM students").get().count), 50);
  assert.equal((await send({ ...payload, center: "Другой центр" })).status, 409);
  assert.equal((await send(payload, "bad")).status, 400);
  await api.stop(); await api.start();
  api.withDb((db) => db.prepare("UPDATE events SET active=0,deadline='2001-01-01' WHERE id=?").run(id));
  const retry = await send(); assert.equal(retry.status, 201);
  assert.deepEqual(await retry.json(), receipts[0]);
  assert.equal(api.withDb((db) => db.prepare("SELECT COUNT(*) AS count FROM students").get().count), 50);
});
test("phone validation rejects punctuation-only contacts and accepts real international numbers", async (t) => {
  const api = await awardsFixture(); t.after(() => api.close());
  const id = await api.create();
  for (const phone of ["-------", "( ) - ( )", "+1234567890123456"]) {
    const result = await api.request("/registrations", { method: "POST", body: teamPayload(id, { phone }) });
    assert.equal(result.res.status, 400, phone);
  }
  assert.equal((await api.request("/registrations", { method: "POST", body: teamPayload(id, { phone: "+7 (771) 485-92-26" }) })).res.status, 201);
});
