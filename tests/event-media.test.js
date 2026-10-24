import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

// Actual one-pixel images, rather than a file extension or signature alone.
const images = [
  {
    type: "image/png",
    extension: /\.png$/,
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQidoCAAGoASP3Q8frAAAAAElFTkSuQmCC",
      "base64",
    ),
  },
  {
    type: "image/jpeg",
    extension: /\.jpe?g$/,
    bytes: Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDjqKKK+zPmj//Z",
      "base64",
    ),
  },
  {
    type: "image/webp",
    extension: /\.webp$/,
    bytes: Buffer.from(
      "UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8iJf/UGfIM+QZ+ql/82BAzQ+dAAA",
      "base64",
    ),
  },
];

async function temporaryServer(t, { demo = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "iqland-event-media-"));
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

  async function request(path, { cookie, method = "GET", body, type } = {}) {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined
          ? { "Content-Type": type || (raw ? "application/octet-stream" : "application/json") }
          : {}),
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get("content-type")?.includes("application/json")
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

  async function start(seed = demo) {
    const env = { ...process.env, DATA_DIR: dir, PORT: String(port), NODE_ENV: "test" };
    delete env.IQLAND_SEED_DEMO_EVENTS;
    if (seed) env.IQLAND_SEED_DEMO_EVENTS = "true";
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
    assert.fail("Isolated event API failed to start: " + output);
  }

  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await start();

  const accounts = JSON.parse(readFileSync(join(dir, "initial-accounts.json"), "utf8"));
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

  return { dir, request, start, stop, admin, director };
}

const event = {
  title: "Олимпиада IQ LAND",
  city: "Астана",
  country: "Казахстан",
  flag: "🇰🇿",
  date: "2099-10-03",
  deadline: "2099-09-20",
  subjects: ["Математика"],
  includes: ["Сертификат участника"],
  price: 25000,
  currency: "KZT",
  image: "",
  description: "Международная олимпиада для школьников.",
  active: true,
};

test("fresh databases have no public or private demonstration events", async (t) => {
  const api = await temporaryServer(t);
  assert.deepEqual((await api.request("/api/events")).data, []);
  assert.deepEqual((await api.request("/api/manage", { cookie: api.admin })).data.events, []);
  await api.stop();
  await api.start();
  assert.deepEqual((await api.request("/api/events")).data, [], "Restart must not reseed events");
  const created = await api.request("/api/events", {
    method: "POST", cookie: api.admin, body: event,
  });
  assert.equal(created.response.status, 201, "An organizer can create an event without a photo");
  const { data } = await api.request(`/api/events/${created.data.id}`);
  assert.equal(data.title, event.title);
  assert.equal(data.image, "");
});

test("event images require an organizer, reject invalid uploads, and retain real image files across restart", async (t) => {
  const api = await temporaryServer(t);
  const [png, jpeg, webp] = images;
  const upload = (image, cookie = api.admin) => api.request("/api/event-images", {
    method: "POST", cookie, type: image.type, body: image.bytes,
  });

  assert.equal((await api.request("/api/event-images", {
    method: "POST", type: png.type, body: png.bytes,
  })).response.status, 401);
  assert.equal((await upload(png, api.director)).response.status, 201, "Director can upload event photos");

  const uploaded = [];
  for (const image of images) {
    const { response, data } = await upload(image);
    assert.equal(response.status, 201, `${image.type} must be accepted`);
    assert.match(data.url, /^\/api\/event-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/);
    assert.match(data.url, image.extension);
    assert.equal((await api.request(data.url)).response.status, 404, "Unpublished uploads must stay private");
    const result = await api.request(data.url, { cookie: api.director });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("content-type"), image.type);
    assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(result.bytes, image.bytes);
    assert.deepEqual(readFileSync(join(api.dir, "uploads", basename(data.url))), image.bytes);
    uploaded.push({ ...image, url: data.url });
  }

  const filesBefore = readdirSync(join(api.dir, "uploads")).sort();
  for (const image of [
    { type: "image/svg+xml", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
    { type: "text/html", bytes: Buffer.from("<html>image</html>") },
    { type: "image/png", bytes: jpeg.bytes },
    { type: "image/jpeg", bytes: webp.bytes },
    { type: "image/webp", bytes: png.bytes },
    { type: "image/png", bytes: Buffer.alloc(0) },
    { type: "image/png", bytes: png.bytes.subarray(0, 8) },
    { type: "image/jpeg", bytes: jpeg.bytes.subarray(0, jpeg.bytes.length - 2) },
    { type: "image/webp", bytes: webp.bytes.subarray(0, webp.bytes.length - 2) },
  ]) {
    const { response } = await upload(image);
    assert.ok([400, 415].includes(response.status), `Invalid ${image.type} (${image.bytes.length} bytes): ${response.status}`);
  }
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  png.bytes.copy(oversized);
  assert.equal((await upload({ type: png.type, bytes: oversized })).response.status, 413);
  assert.deepEqual(readdirSync(join(api.dir, "uploads")).sort(), filesBefore, "Rejected uploads must not leave files");

  for (const path of [
    "/api/event-images/not-a-file.png",
    "/api/event-images/00000000-0000-4000-8000-000000000000.png",
    "/api/event-images/00000000-0000-4000-8000-000000000000.svg",
    "/api/event-images/..%2F..%2Fiqland.sqlite",
    "/api/event-images/%2e%2e%5ciqland.sqlite",
    "/api/event-images/initial-accounts.json",
    uploaded[0].url + "%00",
  ]) assert.equal((await api.request(path)).response.status, 404, path);

  const { response, data } = await api.request("/api/events", {
    method: "POST", cookie: api.admin, body: { ...event, image: uploaded[0].url },
  });
  assert.equal(response.status, 201);
  const eventId = data.id;
  assert.equal((await api.request(`/api/events/${eventId}`)).data.image, uploaded[0].url);

  for (const image of [
    "https://example.com/photo.png",
    "data:image/png;base64," + png.bytes.toString("base64"),
    "/images/baku.png",
    "/images/almaty.png",
    "/api/event-images/00000000-0000-4000-8000-000000000000.png",
    "/api/event-images/..%2F..%2Fiqland.sqlite",
  ]) {
    for (const [path, method] of [["/api/events", "POST"], [`/api/events/${eventId}`, "PUT"]]) {
      assert.equal((await api.request(path, {
        method, cookie: api.admin, body: { ...event, image },
      })).response.status, 400, `${method} must reject unowned image URL`);
    }
  }
  assert.equal((await api.request(`/api/events/${eventId}`)).data.image, uploaded[0].url, "Rejected edits preserve current image");
  assert.equal((await api.request("/api/events")).data.length, 1, "Rejected creates do not create events");

  await api.stop();
  await api.start();
  for (const image of uploaded) {
    const result = await api.request(image.url, { cookie: api.director });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get("content-type"), image.type);
    assert.deepEqual(result.bytes, image.bytes);
  }
  assert.equal((await api.request(`/api/events/${eventId}`)).data.image, uploaded[0].url);
  assert.equal((await api.request(uploaded[0].url)).response.status, 200, "Published photo is public");
  assert.equal((await api.request(uploaded[0].url)).response.headers.get("cache-control"), "no-store");
  assert.equal((await api.request(`/api/events/${eventId}`, { method: "PUT", cookie: api.admin, body: { ...event, image: uploaded[0].url, active: false } })).response.status, 200);
  assert.equal((await api.request(uploaded[0].url)).response.status, 404, "Hiding event revokes anonymous image access");
  assert.equal((await api.request(`/api/events/${eventId}`, {
    method: "PUT", cookie: api.admin, body: { ...event, image: "" },
  })).response.status, 200, "Admin can remove a photo after restart");
  assert.equal((await api.request(`/api/events/${eventId}`)).data.image, "");
  assert.equal((await api.request(uploaded[0].url)).response.status, 404, "Removing photo revokes its public URL");
});

test("demo events are opt-in and the legacy migration hides only unchanged demos once while retaining teams", async (t) => {
  const api = await temporaryServer(t, { demo: true });
  const { data: demos } = await api.request("/api/events");
  assert.equal(demos.length, 2);
  assert.deepEqual(demos.map((row) => row.id).sort(), ["almaty-2027", "baku-2027"]);
  assert.ok(demos.every((row) => row.image === ""));

  await api.stop();

  const registrationId = "IQ-MIGRATION";
  const database = new DatabaseSync(join(api.dir, "iqland.sqlite"));
  try {
    // Recreate a pre-migration database, with the original stock pictures.
    database.prepare("DELETE FROM settings WHERE key=?").run("migration:remove-seeded-events:v1");
    database.prepare("UPDATE events SET image=? WHERE id=?").run("/images/baku.png", "baku-2027");
    database.prepare("UPDATE events SET title=?,image=? WHERE id=?").run("Новая олимпиада Алматы", "/images/almaty.png", "almaty-2027");
    database.prepare(`INSERT INTO events(id,title,city,country,flag,date,deadline,subjects,includes,price,currency,image,description,active)
      SELECT 'organizer-event','Авторская олимпиада','Астана',country,flag,date,deadline,subjects,includes,price,currency,'/images/baku.png',description,1
      FROM events WHERE id='baku-2027'`).run();
    // Historical registrations must survive, even after their event's deadline.
    database.prepare(`INSERT INTO registrations(id,event_id,center,city,teacher,email,phone,teachers,note,status,created)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      registrationId, "baku-2027", "Центр миграции", "Астана", "Учитель команды",
      "migration@example.com", "+77001234567", JSON.stringify(["Второй учитель"]),
      "Сохранить при миграции", "confirmed", "2026-10-01T12:00:00.000Z",
    );
    database.prepare("INSERT INTO students(id,registration_id,name,birth,grade) VALUES(?,?,?,?,?)").run(
      "migration-student", registrationId, "Ученик Тестовый", "2015-03-15", 5,
    );
    database.prepare("INSERT INTO entries(id,student_id,subject,score) VALUES(?,?,?,?)").run(
      "migration-entry", "migration-student", "Математика", 87,
    );
  } finally {
    database.close();
  }

  await api.start(false);
  assert.deepEqual((await api.request("/api/events")).data.map((row) => row.id).sort(), ["almaty-2027", "organizer-event"]);
  assert.equal((await api.request("/api/events/baku-2027")).response.status, 404);
  const { data: managed } = await api.request("/api/manage", { cookie: api.admin });
  assert.equal(managed.events.length, 3);
  const baku = managed.events.find((row) => row.id === "baku-2027");
  assert.equal(baku.active, false);
  assert.ok(managed.events.filter((row) => row.id !== baku.id).every((row) => row.active));
  assert.equal(managed.events.find((row) => row.id === "almaty-2027").title, "Новая олимпиада Алматы");
  assert.ok(managed.events.every((row) => row.image === ""), "Legacy photo paths are cleared for customized events too");
  assert.equal(managed.registrations.length, 1);
  assert.equal(managed.registrations[0].id, registrationId);
  assert.equal(managed.registrations[0].student_count, 1);
  assert.deepEqual(managed.registrations[0].teachers, ["Второй учитель"]);
  assert.equal(managed.entries.length, 1);
  assert.equal(managed.entries[0].name, "Ученик Тестовый");
  assert.equal(managed.entries[0].score, 87);

  assert.equal((await api.request("/api/events/baku-2027", {
    method: "PUT", cookie: api.admin, body: { ...baku, active: true },
  })).response.status, 200);
  await api.stop();
  await api.start(false);
  assert.equal((await api.request("/api/events/baku-2027")).response.status, 200, "Migration must not hide an explicitly reactivated event on subsequent boots");
  const { data: restarted } = await api.request("/api/manage", { cookie: api.admin });
  assert.equal(restarted.registrations[0].id, registrationId);
  assert.equal(restarted.entries.length, 1);
  assert.equal(restarted.entries[0].score, 87);
});
