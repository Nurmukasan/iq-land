import { PRIVACY_VERSION } from "../shared/privacy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeTelegramUrl } from "../server/validation.js";

const invite = "https://t.me/+AbCdEfGhIjKlMnOpQrStUv";
const secondInvite = "https://t.me/+ZyXwVuTsRqPoNmLkJiHgFe";
const event = (overrides = {}) => ({
  title: "Тестовая олимпиада организатора",
  city: "Астана",
  country: "Казахстан",
  date: "2099-10-03",
  deadline: "2099-09-20",
  subjects: ["Математика"],
  includes: ["Сертификат участника"],
  price: null,
  currency: "KZT",
  description: "Изолированное тестовое мероприятие.",
  ...overrides,
});
const registration = (eventId) => ({
  eventId,
  center: "Тестовый центр",
  city: "Астана",
  teacher: "Тестовый учитель",
  email: "teacher@example.test",
  phone: "+77001234567",
  consent: true, privacyVersion: PRIVACY_VERSION,
  students: [
    {
      name: "Тестовый участник",
      birth: "2015-03-15",
      grade: 5,
      subjects: ["Математика"],
    },
  ],
});

async function temporaryServer(t) {
  const dir = mkdtempSync(join(tmpdir(), "iqland-telegram-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  let child;
  let logs = "";
  const cookies = {};
  const request = async (path, { cookie, method = "GET", body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, data: await response.json() };
  };
  const stop = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  };
  const start = async () => {
    const env = {
      ...process.env,
      DATA_DIR: dir,
      PORT: String(port),
      NODE_ENV: "test",
    };
    delete env.IQLAND_SEED_DEMO_EVENTS;
    logs = "";
    child = spawn(process.execPath, ["server/index.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (bytes) => (logs += bytes));
    child.stderr.on("data", (bytes) => (logs += bytes));
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await request("/health")).response.ok) return;
      } catch {}
      if (child.exitCode !== null) break;
      await delay(100);
    }
    assert.fail("Isolated Telegram API failed to start: " + logs);
  };
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();
  for (const account of JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  )) {
    const { response } = await request("/auth/login", {
      method: "POST",
      body: { email: account.email, password: account.password },
    });
    assert.equal(response.status, 200);
    cookies[account.role] = response.headers.get("set-cookie").split(";")[0];
  }
  const create = async (payload, cookie = cookies.admin) => {
    const result = await request("/events", {
      method: "POST",
      cookie,
      body: payload,
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    return result.data.id;
  };
  return { dir, request, start, stop, create, ...cookies };
}

test("Telegram channels accept trusted public and private URLs and reject deceptive hosts", () => {
  for (const suffix of [
    "",
    "?mode=copy",
    "?other=https://example.test/#tracking",
  ]) {
    assert.equal(normalizeTelegramUrl(invite + suffix), invite);
  }
  assert.equal(normalizeTelegramUrl(" " + invite + " "), invite);
  assert.equal(
    normalizeTelegramUrl("https://telegram.me/iqland_competitions"),
    "https://t.me/iqland_competitions",
  );
  assert.equal(
    normalizeTelegramUrl("https://t.me/joinchat/AbCdEfGhIjKlMnOp"),
    "https://t.me/joinchat/AbCdEfGhIjKlMnOp",
  );
  assert.equal(normalizeTelegramUrl(""), "");
  for (const value of [
    null,
    false,
    {},
    "javascript:alert(1)",
    "http://t.me/iqland",
    "https:t.me/iqland",
    "https://t.me.evil.test/iqland",
    "https://evil.t.me/iqland",
    "https://t.me@evil.test/iqland",
    "https://user:pass@t.me/iqland",
    "https://t.me:8443/iqland",
    "https://t.me/share",
    "https://t.me/proxy",
    "https://t.me/c/123",
    "https://t.me/iqland/123",
    "https://t.me/+short",
    "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv",
    "https://t.me/iqland\\evil",
    invite + "\n?mode=copy",
  ]) {
    assert.equal(normalizeTelegramUrl(value), null, String(value));
  }
});

test("directors create/edit event invitations while admin-only archive and promotions stay protected", async (t) => {
  const api = await temporaryServer(t);
  assert.equal(
    (await api.request("/events", { method: "POST", body: event() })).response
      .status,
    401,
  );
  const id = await api.create(
    event({ telegramUrl: invite + "?mode=gi_t" }),
    api.director,
  );
  let managed = (await api.request("/manage", { cookie: api.director })).data;
  assert.equal(managed.events[0].telegramUrl, invite);
  assert.equal(
    (
      await api.request(`/events/${id}`, {
        method: "PUT",
        cookie: api.director,
        body: event({
          title: "Изменено руководителем",
          telegramUrl: secondInvite,
        }),
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await api.request(`/events/${id}`, {
        method: "PUT",
        cookie: api.admin,
        body: event({ title: "Старая форма без нового поля" }),
      })
    ).response.status,
    200,
  );
  managed = (await api.request("/manage", { cookie: api.admin })).data;
  assert.equal(
    managed.events[0].telegramUrl,
    secondInvite,
    "Legacy event clients must not erase an invitation",
  );
  for (const [path, method, body] of [
    ["/promo", "PUT", {}],
    [`/events/${id}/archive`, "PUT", { video: "", resultsPublished: true }],
    ["/event-videos", "POST", {}],
  ])
    assert.equal(
      (await api.request(path, { method, cookie: api.director, body })).response
        .status,
      403,
    );
  assert.equal(
    (
      await api.request(`/events/${id}`, {
        method: "PUT",
        cookie: api.director,
        body: event({
          telegramUrl: "",
          video: "unowned.mp4",
          resultsPublished: true,
        }),
      })
    ).response.status,
    200,
  );
  managed = (await api.request("/manage", { cookie: api.director })).data;
  assert.equal(managed.events[0].telegramUrl, "");
  assert.equal(managed.events[0].video, "");
  assert.equal(managed.events[0].resultsPublished, false);

  for (const telegramUrl of [
    "https://example.com/group",
    "https://t.me:8080/iqland",
    "https://t.me/iqland/123",
  ]) {
    for (const [path, method] of [
      ["/events", "POST"],
      [`/events/${id}`, "PUT"],
    ]) {
      const result = await api.request(path, {
        method,
        cookie: api.director,
        body: event({ telegramUrl }),
      });
      assert.equal(result.response.status, 400);
      assert.ok(
        result.data.fields.some((field) => field.path === "telegramUrl"),
      );
    }
  }
  assert.equal(
    (await api.request("/manage", { cookie: api.director })).data.events.length,
    1,
  );
});

test("each successful team receives only its event invitation; public listings and recaps omit invitations", async (t) => {
  const api = await temporaryServer(t);
  const first = await api.create(event({ telegramUrl: invite }));
  const second = await api.create(event({ telegramUrl: secondInvite }));
  const without = await api.create(event());
  const past = await api.create(
    event({ date: "2000-01-01", deadline: "2000-01-01", telegramUrl: invite }),
  );

  for (const [id, expected] of [
    [first, invite],
    [second, secondInvite],
    [without, ""],
  ]) {
    const registered = await api.request("/registrations", {
      method: "POST",
      body: registration(id),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.data.telegramUrl, expected);
    assert.equal(registered.data.count, 1);
  }
  const invalid = await api.request("/registrations", {
    method: "POST",
    body: { ...registration(first), consent: false },
  });
  assert.equal(invalid.response.status, 400);
  assert.ok(!Object.hasOwn(invalid.data, "telegramUrl"));

  for (const path of [
    "/events",
    `/events/${first}`,
    `/events/${past}`,
    "/archive",
    `/archive/${past}`,
  ]) {
    const result = await api.request(path);
    assert.equal(result.response.status, 200);
    const json = JSON.stringify(result.data);
    assert.ok(
      !json.includes("telegram"),
      path + " must not expose invitation fields",
    );
    assert.ok(!json.includes(invite) && !json.includes(secondInvite));
  }
  assert.equal((await api.request("/manage")).response.status, 401);
});

test("existing databases gain empty invitations without losing accounts/teams; edits persist across restart", async (t) => {
  const api = await temporaryServer(t);
  const id = await api.create(event());
  const result = await api.request("/registrations", {
    method: "POST",
    body: registration(id),
  });
  assert.equal(result.response.status, 201);
  const before = (await api.request("/manage", { cookie: api.director })).data;
  const credentials = readFileSync(
    join(api.dir, "initial-accounts.json"),
    "utf8",
  );
  await api.stop();
  const legacy = new DatabaseSync(join(api.dir, "iqland.sqlite"));
  legacy.exec("ALTER TABLE events DROP COLUMN telegram_url");
  legacy.prepare("UPDATE events SET results_published=1 WHERE id=?").run(id);
  legacy.close();

  await api.start();
  const migrated = (await api.request("/manage", { cookie: api.director }))
    .data;
  assert.equal(migrated.events[0].telegramUrl, "");
  assert.equal(migrated.events[0].resultsPublished, false);
  assert.deepEqual(migrated.registrations, before.registrations);
  assert.deepEqual(migrated.entries, before.entries);
  assert.equal(
    readFileSync(join(api.dir, "initial-accounts.json"), "utf8"),
    credentials,
  );
  assert.equal(
    (
      await api.request(`/events/${id}`, {
        method: "PUT",
        cookie: api.director,
        body: event({ telegramUrl: invite + "?mode=ems_copy_t" }),
      })
    ).response.status,
    200,
  );
  await api.stop();
  await api.start();
  const persisted = (await api.request("/manage", { cookie: api.director }))
    .data;
  assert.equal(persisted.events[0].telegramUrl, invite);
  assert.equal(
    persisted.events[0].resultsPublished,
    false,
    "Legacy public-result flags stay disabled",
  );
  assert.deepEqual(persisted.entries, before.entries);
  assert.equal(
    readFileSync(join(api.dir, "initial-accounts.json"), "utf8"),
    credentials,
  );
});
