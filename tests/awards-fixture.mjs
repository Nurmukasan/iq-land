import { PRIVACY_VERSION } from "../shared/privacy.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

export const today = new Date().toISOString().slice(0, 10);
export const eventPayload = (overrides = {}) => ({
  title: "ТЕСТ · Международная олимпиада",
  city: "Астана",
  country: "Казахстан",
  date: today,
  deadline: today,
  subjects: ["Ментальная арифметика", "Английский язык", "Математика"],
  includes: ["Программа олимпиады"],
  price: null,
  currency: "KZT",
  description: "Только вымышленные участники для проверки.",
  ...overrides,
});
export const teamPayload = (eventId, overrides = {}) => ({
  eventId,
  center: "Тестовый центр",
  city: "Астана",
  teacher: "Тестовый Учитель",
  email: "teacher@example.test",
  phone: "+77001234567",
  consent: true, privacyVersion: PRIVACY_VERSION,
  students: [
    {
      name: "Тестовый Ученик",
      birth: `${Number(today.slice(0, 4)) - 12}-01-01`,
      grade: 6,
      subjects: ["Математика"],
    },
  ],
  ...overrides,
});
export async function awardsFixture({ environment = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "iqland-awards-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let logs = "";
  const request = async (path, { cookie, method = "GET", body } = {}) => {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.headers.get("content-type")?.includes("application/json")
      ? await res.json()
      : Buffer.from(await res.arrayBuffer());
    return { res, data };
  };
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      await done;
    }
  };
  const start = async () => {
    logs = "";
    child = spawn(process.execPath, ["server/index.js"], {
      env: {
        ...process.env,
        ...environment,
        DATA_DIR: dir,
        PORT: String(port),
        NODE_ENV: "test",
        IQLAND_SEED_DEMO_EVENTS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (b) => (logs += b));
    child.stderr.on("data", (b) => (logs += b));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await request("/health")).res.ok) return;
      } catch {}
      if (child.exitCode !== null) break;
      await delay(100);
    }
    throw Error("Isolated awards API failed to start: " + logs);
  };
  try {
    await start();
  } catch (e) {
    await stop();
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
  const cookies = {};
  for (const u of accounts) {
    const { res } = await request("/auth/login", {
      method: "POST",
      body: { email: u.email, password: u.password },
    });
    assert.equal(res.status, 200);
    cookies[u.role] = res.headers.get("set-cookie").split(";")[0];
  }
  const create = async (payload = eventPayload()) => {
    const r = await request("/events", {
      cookie: cookies.director,
      method: "POST",
      body: payload,
    });
    assert.equal(r.res.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  const withDb = (fn) => {
    const db = new DatabaseSync(join(dir, "iqland.sqlite"));
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };
  return {
    dir,
    base,
    request,
    accounts,
    ...cookies,
    create,
    start,
    stop,
    withDb,
    close: async () => {
      await stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
