import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ExcelJS from "exceljs";

const dir = mkdtempSync(join(tmpdir(), "iqland-test-"));
const port = 35000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
let child, accounts, adminCookie, directorCookie, registrationId, entries;
async function request(path, { cookie, method = "GET", body, origin } = {}) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : await res.arrayBuffer();
  return { res, data };
}
before(async () => {
  child = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (b) => (logs += b));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/health")).res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(ready, "API failed to start: " + logs);
  accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
});
after(async () => {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((r) => child.once("exit", r));
  }
  rmSync(dir, { recursive: true, force: true });
});

const payload = {
  eventId: "baku-2027",
  center: "Тестовый центр",
  city: "Алматы",
  teacher: "Тестовый Учитель",
  email: "teacher@example.com",
  phone: "+7 (700) 123-45-67",
  teachers: ["Второй Педагог"],
  note: "Тестовая заявка",
  consent: true,
  students: [
    {
      name: "Ахметова Алия",
      birth: "2015-03-15",
      grade: 5,
      subjects: ["Математика", "Английский язык"],
    },
    {
      name: "Иванов Иван",
      birth: "2015-07-22",
      grade: 5,
      subjects: ["Математика"],
    },
  ],
};

test("public event data works; private data and exports require authentication", async () => {
  const { data } = await request("/events");
  assert.equal(data.length, 2);
  assert.equal(data[0].city, "Баку");
  for (const p of ["/manage", "/export"])
    assert.equal((await request(p)).res.status, 401);
  assert.equal((await request("/auth/me")).data.user, null);
});
test("registration validates dates, subject membership and consent before writing", async () => {
  for (const body of [
    { ...payload, consent: false },
    { ...payload, students: [{ ...payload.students[0], birth: "2015-02-31" }] },
    {
      ...payload,
      students: [
        { ...payload.students[0], subjects: ["Ментальная арифметика"] },
      ],
    },
  ])
    assert.equal(
      (await request("/registrations", { method: "POST", body })).res.status,
      400,
    );
});
test("a whole team is persisted with one reference", async () => {
  const { res, data } = await request("/registrations", {
    method: "POST",
    body: payload,
  });
  assert.equal(res.status, 201);
  assert.match(data.id, /^IQ-[A-F0-9]+$/);
  assert.equal(data.count, 2);
  registrationId = data.id;
});
test("login establishes an HttpOnly session for each role; passwords stay private", async () => {
  for (const account of accounts) {
    const { res, data } = await request("/auth/login", {
      method: "POST",
      body: { email: account.email, password: account.password },
    });
    assert.equal(res.status, 200);
    assert.equal(data.user.role, account.role);
    assert.equal(data.user.password, undefined);
    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    if (account.role === "admin") adminCookie = cookie.split(";")[0];
    else directorCookie = cookie.split(";")[0];
  }
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: accounts[0].email, password: "wrong-password" },
      })
    ).res.status,
    401,
  );
});
test("team automatically appears in the protocol; extra teacher is retained", async () => {
  const { data } = await request("/manage", { cookie: directorCookie });
  assert.equal(data.registrations.length, 1);
  assert.equal(data.registrations[0].student_count, 2);
  assert.deepEqual(data.registrations[0].teachers, ["Второй Педагог"]);
  assert.equal(data.entries.length, 3);
  assert.equal(new Set(data.entries.map((r) => r.student_id)).size, 2);
  entries = data.entries;
});
test("director can confirm a team and record scores, but cannot manage events or ads", async () => {
  assert.equal(
    (
      await request("/registrations/" + registrationId + "/status", {
        cookie: directorCookie,
        method: "PATCH",
        body: { status: "confirmed" },
      })
    ).res.status,
    200,
  );
  for (const row of entries.filter((r) => r.subject === "Математика"))
    assert.equal(
      (
        await request("/entries/" + row.id, {
          cookie: directorCookie,
          method: "PATCH",
          body: { score: 90 },
        })
      ).res.status,
      200,
    );
  assert.equal(
    (
      await request("/entries/" + entries[0].id, {
        cookie: directorCookie,
        method: "PATCH",
        body: { score: 101 },
      })
    ).res.status,
    400,
  );
  assert.equal(
    (
      await request("/events", {
        cookie: directorCookie,
        method: "POST",
        body: {},
      })
    ).res.status,
    403,
  );
  assert.equal(
    (
      await request("/promo", {
        cookie: directorCookie,
        method: "PUT",
        body: {},
      })
    ).res.status,
    403,
  );
});
test("Excel contains unique participants, ranked results with ties, and gratitude teachers", async () => {
  const { res, data } = await request("/export?event=baku-2027", {
    cookie: directorCookie,
  });
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["Участники", "Протокол", "Учителя"],
  );
  assert.equal(wb.getWorksheet("Участники").rowCount, 3);
  const protocol = wb.getWorksheet("Протокол");
  const math = [];
  protocol.eachRow((r, i) => {
    if (i > 1 && r.getCell(2).value === "Математика")
      math.push([r.getCell(6).value, r.getCell(7).value]);
  });
  assert.deepEqual(math, [
    [90, 1],
    [90, 1],
  ]);
  assert.equal(wb.getWorksheet("Учителя").rowCount, 3);
});
test("cancelled teams are omitted from final results and retained in the participant audit", async () => {
  await request("/registrations/" + registrationId + "/status", {
    cookie: directorCookie,
    method: "PATCH",
    body: { status: "cancelled" },
  });
  const { data } = await request("/export", { cookie: directorCookie });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  assert.equal(wb.getWorksheet("Протокол").rowCount, 1);
  assert.equal(wb.getWorksheet("Участники").rowCount, 3);
});
test("admin can edit events without discarding subjects already in use; unsafe ad URLs are rejected", async () => {
  const { data: events } = await request("/events");
  const e = events[0];
  assert.equal(
    (
      await request("/events/" + e.id, {
        method: "PUT",
        cookie: adminCookie,
        body: { ...e, price: 25000 },
      })
    ).res.status,
    200,
  );
  assert.equal(
    (
      await request("/events/" + e.id, {
        method: "PUT",
        cookie: adminCookie,
        body: { ...e, subjects: ["Английский язык"] },
      })
    ).res.status,
    400,
  );
  const promo = (await request("/promo")).data;
  assert.equal(
    (
      await request("/promo", {
        method: "PUT",
        cookie: adminCookie,
        body: { ...promo, href: "javascript:alert(1)" },
      })
    ).res.status,
    400,
  );
  assert.equal(
    (
      await request("/promo", {
        method: "PUT",
        cookie: adminCookie,
        body: { ...promo, title: "Тестовое предложение" },
      })
    ).res.status,
    200,
  );
});
test("cross-origin mutations are rejected; logout revokes the session", async () => {
  assert.equal(
    (
      await request("/registrations/" + registrationId + "/status", {
        method: "PATCH",
        cookie: adminCookie,
        origin: "https://untrusted.example",
        body: { status: "new" },
      })
    ).res.status,
    403,
  );
  assert.equal(
    (await request("/auth/logout", { method: "POST", cookie: adminCookie })).res
      .status,
    200,
  );
  assert.equal(
    (await request("/manage", { cookie: adminCookie })).res.status,
    401,
  );
});
test("database, scores and authenticated sessions survive server restart", async () => {
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  child = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir },
    stdio: "ignore",
  });
  let data;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await request("/manage", { cookie: directorCookie });
      if (response.res.ok) {
        data = response.data;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.equal(data.registrations[0].id, registrationId);
  assert.equal(data.entries.filter((r) => r.score === 90).length, 2);
  assert.equal(data.events.length, 2);
  assert.equal(
    JSON.parse(readFileSync(join(dir, "initial-accounts.json"), "utf8"))[0]
      .password,
    accounts[0].password,
  );
});
