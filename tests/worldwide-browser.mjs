import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Run after npm run build. This test owns its server, database and credentials.
// The generated PNGs are test fixtures, not photographs displayed by the product.
const dir = mkdtempSync(join(tmpdir(), "iqland-worldwide-browser-"));
const port = 51000 + Math.floor(Math.random() * 9000);
const base = `http://127.0.0.1:${port}`;
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
      // Inherited demo settings must never affect this ordinary fresh database.
      IQLAND_SEED_DEMO_EVENTS: "false",
      IQLAND_ADMIN_PASSWORD: "",
      IQLAND_DIRECTOR_PASSWORD: "",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Worldwide test API exited before becoming ready");
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Worldwide test API did not start");
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const terminated = await Promise.race([
    exited.then(() => true),
    delay(3000).then(() => false),
  ]);
  if (!terminated) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function newPage(options = {}) {
  const page = await browser.newPage({locale: "ru-RU",
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  return page;
}

async function createPng(page, colour) {
  const dataUrl = await page.evaluate((colour) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 320, 240);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, "#192851");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 320, 240);
    context.fillStyle = "#ffffff";
    context.fillRect(30, 30, 90, 90);
    return canvas.toDataURL("image/png");
  }, colour);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function getEvent(page, eventId) {
  const response = await page.request.get(base + "/api/events/" + eventId);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function uploadImage(page, buffer, filename) {
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/event-images" &&
      response.request().method() === "POST",
  );
  await page.getByLabel("Загрузить фото мероприятия", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer,
  });
  const response = await uploaded;
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  expect(url).toMatch(/^\/api\/event-images\/[\w-]+\.png$/);
  await expect(page.locator(".event-photo-upload-preview img")).toHaveAttribute(
    "src",
    url,
  );
  await expect(
    page.getByRole("button", { name: "Сохранить мероприятие", exact: true }),
  ).toBeEnabled();
  const image = await page.request.get(base + url);
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toMatch(/^image\/png/);
  expect(Buffer.compare(await image.body(), buffer)).toBe(0);
  return url;
}

async function saveEvent(page, method) {
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/events") &&
      response.request().method() === method,
  );
  await page
    .getByRole("button", { name: "Сохранить мероприятие", exact: true })
    .click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return response.json();
}

async function openEventEditor(page) {
  await page.goto(base + "/cabinet");
  await page.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Изменить мероприятие", exact: true }),
  ).toBeVisible();
}

async function expectPublishedImage(page, eventId, imageUrl) {
  for (const [path, container] of [
    ["/", ".event-card"],
    ["/register", ".reg-choice"],
    [`/events/${eventId}/register`, ".reg-event-banner"],
  ]) {
    await page.goto(base + path);
    const surface = page.locator(container).first();
    await expect(surface).toContainText("Стамбул");
    const image = surface.locator(`img[src="${imageUrl}"]`);
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
      .toBe(true);
    if (path === "/") {
      await surface.getByRole("button", { name: "Подробнее об олимпиаде в городе Стамбул", exact: true }).click();
      await expect(page.getByRole("dialog").locator(`img[src="${imageUrl}"]`)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.reload();
    await expect(page.locator(container).first().locator(`img[src="${imageUrl}"]`))
      .toBeVisible();
  }
}

async function noOverflow(page, path, widths) {
  await page.goto(base + path);
  await expect(page.locator(
    path === "/" ? ".event-card" : path === "/register" ? ".reg-choice" : ".reg-event-banner",
  ).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.document, `${path} overflows at ${width}px`).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    expect(overflow.body, `${path} body overflows at ${width}px`).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
  }
}

async function cssVariable(locator, name) {
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name).trim(),
    name,
  );
}

async function moveAcross(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
    steps: 4,
  });
}

async function checkMotion(page) {
  await page.goto(base);
  for (const selector of [".world-stage[data-tilt]", ".event-card[data-tilt]"]) {
    const target = page.locator(selector).first();
    await moveAcross(page, target);
    await expect.poll(async () => Math.abs(parseFloat(await cssVariable(target, "--tilt-y")))).toBeGreaterThan(0);
    expect(await cssVariable(target, "--pointer-x")).toMatch(/%$/);
    await page.mouse.move(0, 0);
    await expect.poll(async () => parseFloat(await cssVariable(target, "--tilt-y"))).toBe(0);
  }
  const magnetic = page.locator(".hero-buttons [data-magnetic]").first();
  await moveAcross(page, magnetic);
  await expect.poll(async () => Math.abs(parseFloat(await cssVariable(magnetic, "--magnet-x")))).toBeGreaterThan(0);
  await page.mouse.down();
  await expect(magnetic.locator(".interaction-ripple")).toHaveCount(1);
  await page.mouse.up();
  await expect(magnetic.locator(".interaction-ripple")).toHaveCount(0, { timeout: 1500 });
  const progress = page.locator(".reading-progress");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  const start = await progress.evaluate((element) => getComputedStyle(element).transform);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect.poll(() => progress.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(start);
  console.log("PASS: pointer tilt, magnetic CTA, click ripple and scroll progress respond to real interactions");

  const reduced = await newPage({ reducedMotion: "reduce" });
  await reduced.goto(base);
  expect(await reduced.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  for (const selector of [".world-stage[data-tilt]", ".event-card[data-tilt]"]) {
    const target = reduced.locator(selector).first();
    const initial = await cssVariable(target, "--tilt-y");
    await moveAcross(reduced, target);
    expect(await cssVariable(target, "--tilt-y")).toBe(initial);
    expect(await target.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  }
  const reducedCta = reduced.locator(".hero-buttons [data-magnetic]").first();
  const initialMagnet = await cssVariable(reducedCta, "--magnet-x");
  await moveAcross(reduced, reducedCta);
  expect(await cssVariable(reducedCta, "--magnet-x")).toBe(initialMagnet);
  await reduced.mouse.down();
  await expect(reducedCta.locator(".interaction-ripple")).toHaveCount(0);
  await reduced.mouse.up();
  await reduced.close();
  console.log("PASS: reduced motion disables tilt, magnetic movement and click ripples");
}

try {
  await startServer();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await newPage();
  const initialEvents = await page.request.get(base + "/api/events");
  expect(await initialEvents.json()).toEqual([]);
  await page.goto(base);
  await expect(page.locator(".hero")).toContainText(/мир/i);
  await expect(page.locator(".event-card")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Баку|Алматы/);
  await expect(page.locator('img[src*="baku"], img[src*="almaty"]')).toHaveCount(0);
  await page.goto(base + "/register");
  await expect(page.locator(".reg-choice")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Баку|Алматы/);
  console.log("PASS: ordinary fresh database has a worldwide landing and no sample events");

  const accounts = JSON.parse(readFileSync(join(dir, "initial-accounts.json"), "utf8"));
  const admin = accounts.find((account) => account.role === "admin");
  const staff = await newPage();
  await staff.goto(base + "/login");
  await staff.getByLabel("Email", { exact: true }).fill(admin.email);
  await staff.getByLabel("Пароль", { exact: true }).fill(admin.password);
  await staff.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
  await expect(staff).toHaveURL(base + "/cabinet");
  await staff.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await staff.getByRole("button", { name: "Добавить", exact: true }).click();
  await staff.getByLabel("Название олимпиады", { exact: true }).fill("Worldwide Test Olympiad");
  await staff.getByLabel("Город", { exact: true }).fill("Стамбул");
  await staff.getByLabel("Страна", { exact: true }).fill("Турция");
  await staff.getByLabel("Флаг / символ", { exact: true }).fill("🌍");
  await staff.getByLabel("Дата олимпиады", { exact: true }).fill("2035-10-03");
  await staff.getByLabel("Приём заявок до", { exact: true }).fill("2035-09-20");
  await staff.getByLabel("Описание", { exact: true }).fill("Тестовое мероприятие для проверки свободного выбора страны и фотографии.");
  const firstPng = await createPng(staff, "#d7ef75");
  const secondPng = await createPng(staff, "#ed9b78");
  const firstUrl = await uploadImage(staff, firstPng, "first-photo.png");
  const created = await saveEvent(staff, "POST");
  const publicEvents = await page.request.get(base + "/api/events");
  const events = await publicEvents.json();
  expect(events).toHaveLength(1);
  const eventId = created.id || events[0].id;
  expect(events[0]).toMatchObject({ city: "Стамбул", country: "Турция", image: firstUrl });
  await expectPublishedImage(page, eventId, firstUrl);
  console.log("PASS: admin creates an arbitrary destination with a real PNG; all registration surfaces use it");

  await openEventEditor(staff);
  const replacedUrl = await uploadImage(staff, secondPng, "replacement-photo.png");
  expect(replacedUrl).not.toBe(firstUrl);
  await saveEvent(staff, "PUT");
  expect((await getEvent(page, eventId)).image).toBe(replacedUrl);
  await expectPublishedImage(page, eventId, replacedUrl);
  await openEventEditor(staff);
  await staff.getByRole("button", { name: "Убрать фото", exact: true }).click();
  await saveEvent(staff, "PUT");
  expect((await getEvent(page, eventId)).image).toBe("");
  for (const [path, container] of [
    ["/", ".event-card"],
    ["/register", ".reg-choice"],
    [`/events/${eventId}/register`, ".reg-event-banner"],
  ]) {
    await page.goto(base + path);
    await expect(page.locator(container).first().locator(".event-photo-placeholder")).toBeVisible();
    await expect(page.locator(container).first().locator("img")).toHaveCount(0);
    await expect(page.locator('img[src*="baku"], img[src*="almaty"]')).toHaveCount(0);
  }
  await openEventEditor(staff);
  const finalUrl = await uploadImage(staff, firstPng, "final-photo.png");
  await saveEvent(staff, "PUT");
  console.log("PASS: replacement and removal save correctly; missing photos use a neutral placeholder");

  await page.goto(base + `/events/${eventId}/register`);
  await page.getByLabel("ФИО ученика 1", { exact: true }).fill("Тестовый Ученик");
  await page.getByLabel("Дата рождения ученика 1", { exact: true }).fill("2015-03-15");
  await page.getByLabel("Класс ученика 1", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByLabel("Образовательный центр").fill("Worldwide Test Centre");
  await page.getByLabel("Город центра").fill("Тестовый город");
  await page.getByLabel("ФИО ответственного учителя").fill("Тестовый Учитель");
  await page.getByLabel("Контактный телефон").fill("+7 (700) 123-45-67");
  await page.getByLabel("Email", { exact: false }).fill("worldwide-test@example.com");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.locator(".reg-consent input").check();
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваша команда в списке!", exact: true })).toBeVisible();
  const reference = await page.locator(".reg-receipt > strong").innerText();
  expect(reference).toMatch(/^IQ-/);
  await page.reload();
  await expect(page.locator(".reg-event-banner")).toContainText("Стамбул");
  const managed = await staff.request.get(base + "/api/manage");
  const management = await managed.json();
  expect(management.registrations.find((registration) => registration.id === reference))
    .toMatchObject({ event_id: eventId, center: "Worldwide Test Centre" });
  await stopServer();
  await startServer();
  await expectPublishedImage(page, eventId, finalUrl);
  const persisted = await staff.request.get(base + "/api/manage");
  expect((await persisted.json()).registrations.some((registration) => registration.id === reference))
    .toBe(true);
  expect(Buffer.compare(await (await page.request.get(base + finalUrl)).body(), firstPng)).toBe(0);
  console.log("PASS: arbitrary event, photo file and submitted team persist through page and server reload");

  for (const path of ["/", "/register", `/events/${eventId}/register`]) {
    await noOverflow(page, path, [320, 390, 768, 1024, 1440]);
  }
  console.log("PASS: home, event chooser and team form have no horizontal overflow at 320–1440px");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  const question = page.getByRole("button", { name: "Можно вставить готовый список из Excel?", exact: true });
  await question.focus();
  await expect(question).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(question).toHaveAttribute("aria-expanded", "false");
  console.log("PASS: interaction controls remain keyboard accessible");

  await checkMotion(page);

  const currentEvent = await getEvent(staff, eventId);
  const closedEvent = await staff.request.put(base + "/api/events/" + eventId, {
    data: { ...currentEvent, date: "2020-10-03", deadline: "2020-09-20" },
  });
  expect(closedEvent.ok()).toBe(true);
  await page.goto(base);
  await expect(page.locator(".event-card")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Главная навигация", exact: true })
    .getByRole("link", { name: "Прошедшие олимпиады", exact: true }).click();
  await expect(page).toHaveURL(base + "/archive");
  await page.locator(`a[href="/archive/${eventId}"]`).first().click();
  await expect(page).toHaveURL(base + `/archive/${eventId}`);
  const programme = page.locator("main");
  await expect(programme).toContainText(currentEvent.title);
  await expect(programme).toContainText(currentEvent.description);
  for (const inclusion of currentEvent.includes)
    await expect(programme).toContainText(inclusion);
  console.log("PASS: past event leaves the upcoming list and opens its programme through the archive");

  expect(errors).toEqual([]);
  console.log("PASS: no browser runtime errors");
} finally {
  await browser?.close();
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
}
