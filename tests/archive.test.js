import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

// Real, one-frame 16 × 16 videos. The fixtures require no external encoder at test time.
const videos = [
  {
    type: "video/mp4",
    extension: "mp4",
    bytes: Buffer.from(
      "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMUbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAACgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAj90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAoAAAAAAABAAAAAAG3bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAAgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABYm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MS4xOS4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAMg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAinoAAAAAAAAABhzdHRzAAAAAAAAAAEAAAABAAACAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALFAAAAAQAAABRzdGNvAAAAAAAAAAEAAANEAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMwAAAAhmcmVlAAACzW1kYXQAAAKuBgX//6rcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MiBrZXlpbnQ9MjUwIGtleWludF9taW49MjUgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAPZYiEACv//vZzfAprbbGB",
      "base64",
    ),
  },
  {
    type: "video/webm",
    extension: "webm",
    bytes: Buffer.from(
      "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHoEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggHS7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhARAAAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIpYMhXLKwMXScgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QCYloA4JCwgRC6gRCagQJVsIRVuYEBElTDZ0B/c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2MS43LjEwM3Nz2mPAi2PFiKWDIVyysDF0Z8ilRaOHRU5DT0RFUkSHmExhdmM2MS4xOS4xMDEgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDQwMDAwMDAwAB9DtnWl54EAo6CBAACAgkmDQgAA8AD2ADgkHBhKAAAwYAAAEL///UiMABxTu2uRu4+zgQC3iveBAfGCAajwgQM=",
      "base64",
    ),
  },
];

const publicEventKeys = [
  "id",
  "title",
  "city",
  "country",
  "flag",
  "date",
  "deadline",
  "subjects",
  "includes",
  "price",
  "currency",
  "image",
  "description",
  "active",
  "video",
  "resultsPublished",
].sort();
const today = new Date().toISOString().slice(0, 10);
const day = (offset) =>
  new Date(Date.parse(today + "T12:00:00Z") + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const event = (date = day(-1), overrides = {}) => ({
  title: "Международная олимпиада IQ LAND",
  city: "Астана",
  country: "Казахстан",
  flag: "🇰🇿",
  date,
  deadline: date,
  subjects: ["Математика", "Английский язык"],
  includes: ["Сертификат участника"],
  price: 25000,
  currency: "KZT",
  image: "",
  description: "Олимпиада для школьных команд.",
  active: true,
  ...overrides,
});

async function temporaryServer(t) {
  const dir = mkdtempSync(join(tmpdir(), "iqland-archive-"));
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = "";
  let admin;
  let director;

  async function request(
    path,
    { cookie, method = "GET", body, type, headers = {} } = {},
  ) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined
          ? {
              "Content-Type":
                type || (raw ? "application/octet-stream" : "application/json"),
            }
          : {}),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const data =
      bytes.length &&
      response.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(bytes.toString())
        : bytes;
    return { response, data, bytes };
  }

  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }

  async function start() {
    const env = {
      ...process.env,
      DATA_DIR: dir,
      PORT: String(port),
      NODE_ENV: "test",
    };
    delete env.IQLAND_SEED_DEMO_EVENTS;
    output = "";
    child = spawn(process.execPath, ["server/index.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await request("/api/health")).response.ok) return;
      } catch {}
      if (child.exitCode !== null) break;
      await delay(100);
    }
    assert.fail("Isolated archive API failed to start: " + output);
  }

  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();
  const accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
  for (const account of accounts) {
    const { response } = await request("/api/auth/login", {
      method: "POST",
      body: { email: account.email, password: account.password },
    });
    assert.equal(response.status, 200, "Generated account must authenticate");
    const cookie = response.headers.get("set-cookie").split(";")[0];
    if (account.role === "admin") admin = cookie;
    if (account.role === "director") director = cookie;
  }

  async function createEvent(payload = event()) {
    const result = await request("/api/events", {
      method: "POST",
      cookie: admin,
      body: payload,
    });
    assert.equal(result.response.status, 201);
    return result.data.id;
  }

  function withDb(callback) {
    const db = new DatabaseSync(join(dir, "iqland.sqlite"));
    try {
      return callback(db);
    } finally {
      db.close();
    }
  }

  return {
    dir,
    base,
    request,
    start,
    stop,
    admin,
    director,
    createEvent,
    withDb,
  };
}

function uploadFiles(dir) {
  const uploads = join(dir, "uploads");
  return existsSync(uploads)
    ? readdirSync(uploads, { recursive: true }).sort()
    : [];
}

test("upcoming and archive lists split at UTC today, hide inactive events, and sort by date", async (t) => {
  const api = await temporaryServer(t);
  const todayId = await api.createEvent(event(today));
  const olderId = await api.createEvent(event(day(-12)));
  const futureId = await api.createEvent(event(day(12)));
  const yesterdayId = await api.createEvent(event(day(-1)));
  const hiddenPast = await api.createEvent(event(day(-3), { active: false }));
  const hiddenFuture = await api.createEvent(event(day(3), { active: false }));

  const upcoming = await api.request("/api/events");
  assert.equal(upcoming.response.status, 200);
  assert.deepEqual(
    upcoming.data.map((row) => row.id),
    [todayId, futureId],
  );
  const archived = await api.request("/api/archive");
  assert.equal(archived.response.status, 200);
  assert.deepEqual(
    archived.data.map((row) => row.id),
    [yesterdayId, olderId],
  );
  for (const row of [...upcoming.data, ...archived.data]) {
    assert.deepEqual(
      Object.keys(row).sort(),
      publicEventKeys,
      "Public events use an explicit field whitelist",
    );
    assert.equal(row.video, "");
    assert.equal(row.resultsPublished, false);
  }
  for (const id of [
    todayId,
    futureId,
    hiddenPast,
    hiddenFuture,
    "missing-event",
  ])
    assert.equal(
      (await api.request(`/api/archive/${id}`)).response.status,
      404,
    );
});

test("archive results stay private until published, rank ties per subject and grade, and expose only public fields", async (t) => {
  const api = await temporaryServer(t);
  const id = await api.createEvent();
  await api.stop();
  api.withDb((db) => {
    for (const status of ["new", "confirmed", "cancelled"]) {
      db.prepare(
        `INSERT INTO registrations(id,event_id,center,city,teacher,email,phone,teachers,note,status,created)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        `private-registration-${status}`,
        id,
        "Private educational center",
        "Private city",
        "Private teacher",
        "private@example.com",
        "+77001234567",
        '["Private additional teacher"]',
        "Private note",
        status,
        new Date().toISOString(),
      );
    }
    for (const [index, [name, grade, subject, score, status]] of [
      ["Первый Ученик", 5, "Математика", 90, "new"],
      ["Второй Ученик", 5, "Математика", 90, "confirmed"],
      ["Третий Ученик", 5, "Математика", 70, "confirmed"],
      ["Другой Класс", 6, "Математика", 60, "confirmed"],
      ["Другой Предмет", 5, "Английский язык", 60, "new"],
      ["Без Баллов", 5, "Математика", null, "confirmed"],
      ["Отменённая Заявка", 5, "Математика", 100, "cancelled"],
      ["Нулевой Балл", 5, "Математика", 0, "confirmed"],
    ].entries()) {
      db.prepare(
        "INSERT INTO students(id,registration_id,name,birth,grade) VALUES(?,?,?,?,?)",
      ).run(
        `private-student-${index}`,
        `private-registration-${status}`,
        name,
        "2015-03-15",
        grade,
      );
      db.prepare(
        "INSERT INTO entries(id,student_id,subject,score) VALUES(?,?,?,?)",
      ).run(
        `private-entry-${index}`,
        `private-student-${index}`,
        subject,
        score,
      );
    }
  });
  await api.start();

  const hidden = await api.request(`/api/archive/${id}`);
  assert.equal(hidden.response.status, 200);
  assert.deepEqual(Object.keys(hidden.data).sort(), [
    "event",
    "results",
    "resultsPublished",
  ]);
  assert.equal(hidden.data.resultsPublished, false);
  assert.equal(hidden.data.event.resultsPublished, false);
  assert.deepEqual(hidden.data.results, []);

  const publish = await api.request(`/api/events/${id}/archive`, {
    method: "PUT",
    cookie: api.admin,
    body: { video: "", resultsPublished: true },
  });
  assert.equal(publish.response.status, 200);
  const published = await api.request(`/api/archive/${id}`);
  assert.equal(published.data.resultsPublished, true);
  assert.equal(published.data.event.resultsPublished, true);
  assert.deepEqual(Object.keys(published.data.event).sort(), publicEventKeys);
  assert.equal(published.data.results.length, 6);
  const resultByName = Object.fromEntries(
    published.data.results.map((row) => [row.name, row]),
  );
  for (const [name, place] of [
    ["Первый Ученик", 1],
    ["Второй Ученик", 1],
    ["Третий Ученик", 3],
    ["Другой Класс", 1],
    ["Другой Предмет", 1],
    ["Нулевой Балл", 4],
  ])
    assert.equal(resultByName[name].place, place, name);
  assert.equal(resultByName["Нулевой Балл"].score, 0);
  for (const row of published.data.results)
    assert.deepEqual(Object.keys(row).sort(), [
      "grade",
      "name",
      "place",
      "score",
      "subject",
    ]);
  const json = JSON.stringify(published.data);
  for (const privateValue of [
    "private@example.com",
    "+77001234567",
    "Private",
    "2015-03-15",
    "private-registration",
    "private-student",
    "private-entry",
  ])
    assert.equal(
      json.includes(privateValue),
      false,
      `Must not expose ${privateValue}`,
    );

  assert.equal(
    (
      await api.request(`/api/events/${id}/archive`, {
        method: "PUT",
        cookie: api.admin,
        body: { video: "", resultsPublished: false },
      })
    ).response.status,
    200,
  );
  assert.deepEqual(
    (await api.request(`/api/archive/${id}`)).data.results,
    [],
    "Unpublishing immediately hides scores",
  );
});

test("only admins can edit archive settings; invalid URLs are rejected and ordinary event edits retain archive settings", async (t) => {
  const api = await temporaryServer(t);
  const id = await api.createEvent();
  const path = `/api/events/${id}/archive`;
  const valid = { video: "", resultsPublished: false };
  assert.equal(
    (await api.request(path, { method: "PUT", body: valid })).response.status,
    401,
  );
  assert.equal(
    (
      await api.request(path, {
        method: "PUT",
        cookie: api.director,
        body: valid,
      })
    ).response.status,
    403,
  );
  assert.equal(
    (
      await api.request("/api/events/nonexistent/archive", {
        method: "PUT",
        cookie: api.admin,
        body: valid,
      })
    ).response.status,
    404,
  );
  for (const body of [
    { video: "" },
    { resultsPublished: true },
    { video: "", resultsPublished: "true" },
    { video: "", resultsPublished: true, arbitrary: "not allowed" },
    ...[
      "https://example.com/video.mp4",
      "javascript:alert(1)",
      "data:video/mp4;base64,AAAA",
      "/api/event-videos/00000000-0000-4000-8000-000000000000.mp4",
      "/api/event-videos/..%2Fiqland.sqlite",
    ].map((video) => ({ video, resultsPublished: true })),
  ])
    assert.equal(
      (await api.request(path, { method: "PUT", cookie: api.admin, body }))
        .response.status,
      400,
    );

  const upload = await api.request("/api/event-videos", {
    method: "POST",
    cookie: api.admin,
    type: videos[0].type,
    body: videos[0].bytes,
  });
  assert.equal(upload.response.status, 201);
  assert.equal(
    (
      await api.request(path, {
        method: "PUT",
        cookie: api.admin,
        body: { video: upload.data.url, resultsPublished: true },
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await api.request(`/api/events/${id}`, {
        method: "PUT",
        cookie: api.admin,
        body: event(day(-1), { title: "Обновлённая олимпиада" }),
      })
    ).response.status,
    200,
  );
  const detail = (await api.request(`/api/archive/${id}`)).data;
  assert.equal(detail.event.title, "Обновлённая олимпиада");
  assert.equal(detail.event.video, upload.data.url);
  assert.equal(detail.resultsPublished, true);
  await api.stop();
  await api.start();
  assert.equal(
    (await api.request(`/api/archive/${id}`)).data.event.video,
    upload.data.url,
  );
  assert.equal(
    (await api.request(path, { method: "PUT", cookie: api.admin, body: valid }))
      .response.status,
    200,
  );
  assert.equal((await api.request(`/api/archive/${id}`)).data.event.video, "");
});

test("video uploads enforce admin, format, and size; public videos support exact bytes, HEAD, ranges, and restart", async (t) => {
  const api = await temporaryServer(t);
  const upload = (video, cookie = api.admin) =>
    api.request("/api/event-videos", {
      method: "POST",
      cookie,
      type: video.type,
      body: video.bytes,
    });
  assert.equal((await upload(videos[0], null)).response.status, 401);
  assert.equal((await upload(videos[0], api.director)).response.status, 403);
  const uploaded = [];
  for (const video of videos) {
    const result = await upload(video);
    assert.equal(result.response.status, 201, video.type);
    assert.match(
      result.data.url,
      new RegExp(`^/api/event-videos/[0-9a-f-]{36}\\.${video.extension}$`),
    );
    const file = await api.request(result.data.url);
    assert.equal(file.response.status, 200);
    assert.equal(file.response.headers.get("content-type"), video.type);
    assert.equal(
      file.response.headers.get("x-content-type-options"),
      "nosniff",
    );
    assert.equal(
      Number(file.response.headers.get("content-length")),
      video.bytes.length,
    );
    assert.equal(file.response.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(file.bytes, video.bytes);
    const head = await api.request(result.data.url, { method: "HEAD" });
    assert.equal(head.response.status, 200);
    assert.equal(head.bytes.length, 0);
    assert.equal(
      Number(head.response.headers.get("content-length")),
      video.bytes.length,
    );
    const range = await api.request(result.data.url, {
      headers: { Range: "bytes=3-17" },
    });
    assert.equal(range.response.status, 206);
    assert.equal(
      range.response.headers.get("content-range"),
      `bytes 3-17/${video.bytes.length}`,
    );
    assert.deepEqual(range.bytes, video.bytes.subarray(3, 18));
    const suffix = await api.request(result.data.url, {
      headers: { Range: "bytes=-8" },
    });
    assert.equal(suffix.response.status, 206);
    assert.deepEqual(suffix.bytes, video.bytes.subarray(-8));
    const invalid = await api.request(result.data.url, {
      headers: { Range: `bytes=${video.bytes.length}-` },
    });
    assert.equal(invalid.response.status, 416);
    uploaded.push({ ...video, url: result.data.url });
  }
  const before = uploadFiles(api.dir);
  for (const video of [
    { type: "text/html", bytes: Buffer.from("<html>video</html>") },
    { type: "video/quicktime", bytes: videos[0].bytes },
    { type: "video/mp4", bytes: videos[1].bytes },
    { type: "video/webm", bytes: videos[0].bytes },
    { type: "video/mp4", bytes: Buffer.alloc(0) },
    { type: "video/mp4", bytes: videos[0].bytes.subarray(0, 32) },
    { type: "video/webm", bytes: videos[1].bytes.subarray(0, 12) },
  ])
    assert.ok(
      [400, 415].includes((await upload(video)).response.status),
      `Invalid ${video.type} must be rejected`,
    );

  const oversizedStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      api.base + "/api/event-videos",
      {
        method: "POST",
        headers: {
          Cookie: api.admin,
          "Content-Type": "video/mp4",
          "Content-Length": 1024 ** 3 + 1,
          Connection: "close",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.setTimeout(5000, () =>
      request.destroy(
        new Error(
          "Oversized upload must be rejected from Content-Length without reading 1 GiB",
        ),
      ),
    );
    request.on("error", reject);
    request.end(videos[0].bytes);
  });
  assert.equal(oversizedStatus, 413);
  assert.deepEqual(
    uploadFiles(api.dir),
    before,
    "Rejected uploads must leave no files",
  );
  for (const path of [
    "/api/event-videos/not-a-video.mp4",
    "/api/event-videos/00000000-0000-4000-8000-000000000000.mp4",
    "/api/event-videos/..%2F..%2Fiqland.sqlite",
    "/api/event-videos/%2e%2e%5ciqland.sqlite",
    "/api/event-videos/initial-accounts.json",
    uploaded[0].url + "%00",
  ])
    assert.equal((await api.request(path)).response.status, 404, path);
  await api.stop();
  await api.start();
  for (const video of uploaded) {
    const file = await api.request(video.url);
    assert.equal(file.response.status, 200);
    assert.equal(file.response.headers.get("content-type"), video.type);
    assert.deepEqual(file.bytes, video.bytes);
  }
});

test("pre-archive databases migrate new columns once and preserve existing event data", async (t) => {
  const api = await temporaryServer(t);
  const payload = event();
  const id = await api.createEvent(payload);
  await api.stop();
  api.withDb((db) => {
    db.exec(
      "ALTER TABLE events DROP COLUMN video; ALTER TABLE events DROP COLUMN results_published;",
    );
  });
  await api.start();
  const detail = await api.request(`/api/archive/${id}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.event.title, payload.title);
  assert.equal(detail.data.event.description, payload.description);
  assert.deepEqual(detail.data.event.subjects, payload.subjects);
  assert.equal(detail.data.event.video, "");
  assert.equal(detail.data.resultsPublished, false);
  api.withDb((db) => {
    const columns = db
      .prepare("PRAGMA table_info(events)")
      .all()
      .map((row) => row.name);
    assert.equal(columns.filter((name) => name === "video").length, 1);
    assert.equal(
      columns.filter((name) => name === "results_published").length,
      1,
    );
  });
  await api.stop();
  await api.start();
  assert.equal(
    (await api.request(`/api/archive/${id}`)).response.status,
    200,
    "Migration remains idempotent",
  );
});
