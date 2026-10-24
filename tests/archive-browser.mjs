import { PRIVACY_VERSION } from "../shared/privacy.js";
import { chromium, expect as baseExpect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const expect = baseExpect.configure({ timeout: 15000 });

// Run after npm run build. The server, database and generated accounts belong
// exclusively to this test. No ffmpeg installation is needed to run it.
// The 72-frame fixture was generated locally, contains no user content, and
// ffprobe verified VP9, 1920x1080, 60/1 fps, 1.2 seconds:
// ffmpeg -f lavfi -i color=c=0x192851:s=1920x1080:r=60:d=1.2
//   -vf drawbox=x=800:y=380:w=320:h=320:color=0xd7ef75:t=fill,fade=t=in:st=0:d=0.4
//   -an -c:v libvpx-vp9 -deadline good -cpu-used 5 -crf 55 -b:v 0
//   -pix_fmt yuv420p tests/fixtures/montage-1080p60.webm
const fixture = readFileSync(new URL("./fixtures/montage-1080p60.webm", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "iqland-archive-browser-"));
const port = 61000 + Math.floor(Math.random() * 3000);
const base = `http://127.0.0.1:${port}`;
const privateContact = {
  center: "Archive Test Centre",
  city: "Тестовый город центра",
  teacher: "Тестовый Учитель Архив",
  email: "archive-private@example.com",
  phone: "+7 (700) 123-45-67",
  teachers: ["Тестовый Педагог Архив"],
  note: "PRIVATE_ARCHIVE_NOTE",
};
const names = {
  alpha: "Тестовый Альфа",
  beta: "Тестовый Бета",
  gamma: "Тестовый Гамма",
  delta: "Тестовый Дельта",
  zero: "Тестовый Ноль",
  unscored: "Тестовый Безбаллов",
  cancelled: "Тестовый Отмена",
};
const birth = "2014-04-10";
let child;
let browser;
const errors = [];

async function startServer() {
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATA_DIR: dir,
      IQLAND_SEED_DEMO_EVENTS: "false",
      IQLAND_ADMIN_PASSWORD: "",
      IQLAND_DIRECTOR_PASSWORD: "",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Archive test API exited before becoming ready");
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Archive test API did not start");
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (!(await Promise.race([exited.then(() => true), delay(3000).then(() => false)]))) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function newPage() {
  const page = await browser.newPage({locale: "ru-RU", viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  return page;
}

async function json(page, path, { method = "GET", data } = {}) {
  const response = await page.request.fetch(base + "/api" + path, { method, data });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return response.json();
}

async function createEvent(staff, overrides = {}) {
  const event = {
    title: "Archive Test Olympiad",
    city: "Прага",
    country: "Чехия",
    flag: "🌍",
    date: "2035-10-03",
    deadline: "2035-09-20",
    subjects: ["Математика", "Английский язык"],
    includes: ["Участие в олимпиаде", "Сертификат участника"],
    price: null,
    currency: "EUR",
    image: "",
    description: "Тестовая олимпиада для проверки архива, итогов и оригинального видео.",
    active: true,
    ...overrides,
  };
  const { id } = await json(staff, "/events", { method: "POST", data: event });
  return { ...event, id };
}

function student(name, grade, subjects = ["Математика"]) {
  return { name, birth, grade, subjects };
}

async function register(page, eventId, students) {
  return json(page, "/registrations", {
    method: "POST",
    data: { ...privateContact, eventId, consent: true, privacyVersion: PRIVACY_VERSION, students },
  });
}

async function openArchiveEditor(staff) {
  await staff.goto(base + "/cabinet");
  await staff.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await staff.locator(".event-manage-list > div").filter({ hasText: "Прага" })
    .getByRole("button", { name: "Итоги и видео", exact: true }).click();
  await expect(staff.getByRole("dialog", { name: "Итоги олимпиады · Прага", exact: true }))
    .toBeVisible();
}

async function uploadVideo(staff, name = "montage-1080p60.webm") {
  const uploaded = staff.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/event-videos" &&
    response.request().method() === "POST");
  await staff.getByLabel("Загрузить монтаж олимпиады", { exact: true }).setInputFiles({
    name, mimeType: "video/webm", buffer: fixture,
  });
  const response = await uploaded;
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  expect(url).toMatch(/^\/api\/event-videos\/[\w-]+\.webm$/);
  await expect(staff.locator(".event-video-upload-preview video")).toHaveAttribute("src", url);
  await expect(staff.getByRole("button", { name: "Сохранить итоги", exact: true })).toBeEnabled();
  return url;
}

async function saveArchive(staff, eventId) {
  const saved = staff.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/events/${eventId}/archive` &&
    response.request().method() === "PUT");
  await staff.getByRole("button", { name: "Сохранить итоги", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(staff.getByRole("dialog")).toHaveCount(0);
}

function expectNoPrivateData(data) {
  const serialized = JSON.stringify(data);
  for (const value of [...Object.values(privateContact).flat(), birth])
    expect(serialized).not.toContain(value);
}

async function verifyVideo(page, videoUrl, { checkLoop = true } = {}) {
  const video = page.locator(".montage-player video");
  await expect(video).toBeVisible();
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute("src", videoUrl);
  await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((element) => ({
    width: element.videoWidth,
    height: element.videoHeight,
    autoplay: element.autoplay,
    loop: element.loop,
    muted: element.muted,
    playsInline: element.playsInline,
    controls: element.controls,
  }))).toEqual({
    width: 1920, height: 1080, autoplay: true, loop: true,
    muted: true, playsInline: true, controls: true,
  });
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(false);
  const before = await video.evaluate((element) => element.currentTime);
  await expect.poll(() => video.evaluate((element) => element.currentTime)).not.toBe(before);
  if (checkLoop) {
    await video.evaluate((element) => {
      element.archiveTestLoops = 0;
      let previous = element.currentTime;
      element.addEventListener("timeupdate", () => {
        if (previous > 0.6 && element.currentTime < 0.4) element.archiveTestLoops++;
        previous = element.currentTime;
      });
    });
    await expect.poll(() => video.evaluate((element) => element.archiveTestLoops), { timeout: 10000 })
      .toBeGreaterThan(0);
  }
  const enableSound = page.getByRole("button", { name: "Включить звук", exact: true });
  await enableSound.focus();
  await expect(enableSound).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(video).toHaveJSProperty("muted", false);
  await page.getByRole("button", { name: "Выключить звук", exact: true }).click();
  await expect(video).toHaveJSProperty("muted", true);
}

async function noOverflow(page, path, readySelector) {
  await page.goto(base + path);
  await expect(page.locator(readySelector).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    const bounds = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(bounds.document, `${path} overflows at ${width}px`).toBeLessThanOrEqual(bounds.viewport + 1);
    expect(bounds.body, `${path} body overflows at ${width}px`).toBeLessThanOrEqual(bounds.viewport + 1);
  }
}

try {
  // Matroska Track DefaultDuration, stored in nanoseconds, verifies that the
  // checked-in 1080p fixture has a 60 fps cadence without a runtime ffmpeg tool.
  const durationTag = fixture.subarray(0, 4096).indexOf(Buffer.from([0x23, 0xe3, 0x83]));
  expect(durationTag).toBeGreaterThan(0);
  const durationLength = fixture[durationTag + 3] & 0x7f;
  expect(durationLength).toBe(3);
  expect(Math.round(1e9 / fixture.readUIntBE(durationTag + 4, durationLength))).toBe(60);

  await startServer();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true, args: ["--no-sandbox"],
  });
  const page = await newPage();
  const staff = await newPage();
  const accounts = JSON.parse(readFileSync(join(dir, "initial-accounts.json"), "utf8"));
  const admin = accounts.find((account) => account.role === "admin");
  await staff.goto(base + "/login");
  await staff.getByLabel("Email", { exact: true }).fill(admin.email);
  await staff.getByLabel("Пароль", { exact: true }).fill(admin.password);
  const loginResponse = staff.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/auth/login" &&
    response.request().method() === "POST");
  await staff.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
  expect((await loginResponse).ok()).toBe(true);
  // Waiting on navigation avoids an assertion snapshot containing the temporary
  // login fields if this machine is busy running other browser suites.
  await staff.waitForURL(base + "/cabinet", { timeout: 30000 });

  const event = await createEvent(staff);
  const future = await createEvent(staff, { title: "Upcoming Test Olympiad", city: "Сеул", country: "Южная Корея" });
  const older = await createEvent(staff, {
    title: "Older Test Olympiad", city: "Вена", country: "Австрия",
    date: "2019-10-03", deadline: "2019-09-20",
  });
  const hidden = await createEvent(staff, {
    title: "Hidden Test Olympiad", city: "Скрытый город", country: "Тестовая страна",
    date: "2020-10-03", deadline: "2020-09-20", active: false,
  });
  const team = await register(page, event.id, [
    student(names.alpha, 5, ["Математика", "Английский язык"]),
    student(names.beta, 5), student(names.gamma, 5), student(names.delta, 6),
    student(names.zero, 0), student(names.unscored, 5),
  ]);
  const cancelled = await register(page, event.id, [student(names.cancelled, 5)]);
  await json(staff, `/registrations/${team.id}/status`, { method: "PATCH", data: { status: "confirmed" } });
  await json(staff, `/registrations/${cancelled.id}/status`, { method: "PATCH", data: { status: "cancelled" } });
  const management = await json(staff, "/manage");
  for (const entry of management.entries.filter((entry) => entry.event_id === event.id)) {
    const score = entry.subject === "Английский язык" ? 70 : ({
      [names.alpha]: 95, [names.beta]: 95, [names.gamma]: 80,
      [names.delta]: 80, [names.zero]: 0, [names.cancelled]: 100,
    })[entry.name];
    if (score !== undefined)
      await json(staff, "/entries/" + entry.id, { method: "PATCH", data: { score } });
  }
  await json(staff, "/events/" + event.id, {
    method: "PUT", data: { ...event, date: "2024-10-03", deadline: "2024-09-20" },
  });
  expect((await json(page, "/events")).map((item) => item.id)).toEqual([future.id]);
  expect((await json(page, "/archive")).map((item) => item.id)).toEqual([event.id, older.id]);
  for (const id of [future.id, hidden.id])
    expect((await page.request.get(base + "/api/archive/" + id)).status()).toBe(404);
  const unpublished = await json(page, "/archive/" + event.id);
  expect(unpublished.resultsPublished).toBe(false);
  expect(unpublished.results).toEqual([]);
  expectNoPrivateData(unpublished);
  console.log("PASS: upcoming and archive lists split by date; inactive and future events stay out of the archive");

  await page.goto(base);
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.locator(".event-card")).toContainText("Сеул");
  await page.getByRole("navigation", { name: "Главная навигация", exact: true })
    .getByRole("link", { name: "Прошедшие олимпиады", exact: true }).click();
  await expect(page).toHaveURL(base + "/archive");
  await expect(page.locator(".archive-card")).toHaveCount(2);
  const archiveLink = page.locator(`.archive-card[href="/archive/${event.id}"]`);
  await expect(archiveLink).toHaveAccessibleName(/Итоги олимпиады: Archive Test Olympiad/);
  await archiveLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(base + "/archive/" + event.id);
  await expect(page.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  await expect(page.locator(".recap-results-table")).toHaveCount(0);
  for (const name of Object.values(names)) await expect(page.locator("main")).not.toContainText(name);
  console.log("PASS: archive navigation and keyboard entry work; unpublished participant results remain hidden");

  await openArchiveEditor(staff);
  const firstVideoUrl = await uploadVideo(staff);
  const savePath = `**/api/events/${event.id}/archive`;
  await staff.route(savePath, (route) => route.fulfill({status: 400, contentType: "application/json", body: JSON.stringify({error: "Тестовый отказ сохранения монтажа"})}));
  await staff.getByRole("button", {name: "Сохранить итоги", exact: true}).click();
  await expect(staff.getByRole("dialog")).toContainText("Тестовый отказ сохранения монтажа");
  await staff.unroute(savePath);
  await expect(staff.getByLabel("Опубликовать результаты", { exact: true })).toHaveCount(0);
  await saveArchive(staff, event.id);
  const published = await json(page, "/archive/" + event.id);
  expect(published.event.video).toBe(firstVideoUrl);
  expect(published.resultsPublished).toBe(false);
  expect(published.results).toEqual([]);
  expectNoPrivateData(published);
  await page.reload();
  await expect(page.locator(".recap-results-table")).toHaveCount(0);
  for (const name of Object.values(names)) await expect(page.locator("main")).not.toContainText(name);
  console.log("PASS: students and awards stay private; montage is public");

  const original = await page.request.get(base + firstVideoUrl);
  expect(original.ok()).toBe(true);
  expect(original.headers()["content-type"]).toMatch(/^video\/webm/);
  expect(Buffer.compare(await original.body(), fixture)).toBe(0);
  const ranged = await page.request.get(base + firstVideoUrl, { headers: { Range: "bytes=0-31" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toBe(`bytes 0-31/${fixture.length}`);
  expect(Buffer.compare(await ranged.body(), fixture.subarray(0, 32))).toBe(0);
  await verifyVideo(page, firstVideoUrl);
  console.log("PASS: original 1080p60 video is byte-identical, supports HTTP Range and actually autoplays, advances and loops");

  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({ path: join(tmpdir(), "iqland-archive-detail.png"), fullPage: true });
  await page.goto(base + "/archive");
  await expect(page.locator(".archive-card")).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".archive-card").evaluateAll((cards) => Promise.all(cards.flatMap((card) =>
    card.getAnimations().filter((animation) => animation.effect.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => {})))));
  await page.screenshot({ path: join(tmpdir(), "iqland-archive-list.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(base + "/archive/" + event.id);
  await expect(page.locator(".recap-results-table tbody tr")).toHaveCount(0);
  await expect.poll(() => page.locator(".montage-player video").evaluate((element) => element.videoWidth)).toBe(1920);
  await page.screenshot({ path: join(tmpdir(), "iqland-archive-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await openArchiveEditor(staff);
  const replacementVideoUrl = await uploadVideo(staff, "replacement-1080p60.webm");
  expect(replacementVideoUrl).not.toBe(firstVideoUrl);
  await saveArchive(staff, event.id);
  await page.reload();
  await expect(page.locator(".montage-player video")).toHaveAttribute("src", replacementVideoUrl);
  await openArchiveEditor(staff);
  await staff.getByRole("button", { name: "Убрать видео", exact: true }).click();
  await saveArchive(staff, event.id);
  await page.reload();
  await expect(page.locator(".montage-player video")).toHaveCount(0);
  await expect(page.locator(".recap-results-table tbody tr")).toHaveCount(0);
  await openArchiveEditor(staff);
  const finalVideoUrl = await uploadVideo(staff, "final-1080p60.webm");
  await expect(staff.getByLabel("Опубликовать результаты", { exact: true })).toHaveCount(0);
  await saveArchive(staff, event.id);
  await page.reload();
  await expect(page.getByRole("heading", { name: event.title, exact: true })).toBeVisible();
  await expect(page.locator(".recap-results-table")).toHaveCount(0);
  for (const name of Object.values(names)) await expect(page.locator("main")).not.toContainText(name);
  expect((await json(page, "/archive/" + event.id)).results).toEqual([]);
  await openArchiveEditor(staff);
  await expect(staff.getByLabel("Опубликовать результаты", { exact: true })).toHaveCount(0);
  await saveArchive(staff, event.id);
  console.log("PASS: organisers can replace/remove montage and keep all participant results private");

  await stopServer();
  await startServer();
  await page.reload();
  await verifyVideo(page, finalVideoUrl, { checkLoop: false });
  await expect(page.locator(".recap-results-table tbody tr")).toHaveCount(0);
  expect(Buffer.compare(await (await page.request.get(base + finalVideoUrl)).body(), fixture)).toBe(0);
  await noOverflow(page, "/archive", ".archive-card");
  await noOverflow(page, "/archive/" + event.id, ".montage-player video");
  console.log("PASS: archive, original video and privacy survive server restart; archive pages fit 320–1440px");
  expect(errors).toEqual([]);
  console.log("PASS: no browser runtime errors");
} finally {
  await browser?.close();
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
}
