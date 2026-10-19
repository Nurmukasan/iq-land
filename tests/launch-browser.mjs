import { chromium, expect as baseExpect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ExcelJS from "exceljs";

// Run after npm run build. This suite creates synthetic teams through the actual
// registration API, owns its temporary database and never touches working .data.
// Screenshots and the unmodified downloaded workbook are deliberately outside
// the repository. All identities and contacts are explicitly fictional.
const expect = baseExpect.configure({ timeout: 20000 });
const dir = mkdtempSync(join(tmpdir(), "iqland-launch-"));
const artifacts = resolve(
  process.env.IQLAND_LAUNCH_ARTIFACTS || "../artifacts/iq-land-launch",
);
mkdirSync(artifacts, { recursive: true });
const port = 62000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
const subjects = ["Математика", "Английский язык", "Ментальная арифметика"];
const inviteA = "https://t.me/+TestOnlyInvite00000001";
const inviteB = "https://t.me/+TestOnlyInvite00000002";
const telegramLabel = "Ссылка на Telegram-канал олимпиады · необязательно";
const errors = [],
  failedRequests = [],
  unexpectedResponses = [],
  checks = [];
const expectedHttpErrors = new Set();
let child, browser;

async function startServer() {
  child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: dir,
      IQLAND_SEED_DEMO_EVENTS: "false",
      IQLAND_ADMIN_PASSWORD: "",
      IQLAND_DIRECTOR_PASSWORD: "",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Launch test API exited before becoming ready");
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Launch test API did not start");
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (
    !(await Promise.race([
      exited.then(() => true),
      delay(3000).then(() => false),
    ]))
  ) {
    child.kill("SIGKILL");
    await exited;
  }
}

async function newPage() {
  const page = await browser.newPage({locale: "ru-RU",
    viewport: { width: 1600, height: 1100 },
    locale: "ru-RU",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("requestfailed", (request) => {
    if (!request.failure()?.errorText?.includes("ERR_ABORTED"))
      failedRequests.push(
        `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
      );
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      !expectedHttpErrors.has(
        `${response.status()} ${new URL(response.url()).pathname}`,
      )
    )
      unexpectedResponses.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  return page;
}

async function api(page, path, { method = "GET", data } = {}) {
  const response = await page.request.fetch(base + "/api" + path, {
    method,
    data,
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(
    true,
  );
  return response.json();
}

async function signIn(page, account) {
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Пароль", { exact: true }).fill(account.password);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/auth/login" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Войти в кабинет", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await page.waitForURL(base + "/cabinet");
}

function eventData(overrides = {}) {
  return {
    title: "ТЕСТ · 252 участника · проверка запуска",
    city: "Тестоград",
    country: "Тестовая страна",
    flag: "🌍",
    date: "2037-05-14",
    deadline: "2037-05-01",
    subjects,
    includes: ["Тестовая программа олимпиады", "Сертификат участника"],
    price: 25000,
    currency: "KZT",
    image: "",
    telegramUrl: inviteA,
    description:
      "ТЕСТОВЫЕ ДАННЫЕ. Вымышленная олимпиада для проверки заявок, сортировки и экспорта. Это не действующее мероприятие IQ LAND.",
    active: true,
    ...overrides,
  };
}

async function createInDirectorUi(page, event) {
  await page.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Новая олимпиада",
    exact: true,
  });
  for (const [label, value] of [
    ["Название олимпиады", event.title],
    ["Город", event.city],
    ["Страна", event.country],
    ["Дата олимпиады", event.date],
    ["Приём заявок до", event.deadline],
    ["Стоимость · пусто, если уточняется", String(event.price)],
    [telegramLabel, inviteA + "?mode=ac_t"],
    ["Описание", event.description],
  ])
    await modal.getByLabel(label, { exact: true }).fill(value);
  await modal.getByLabel("Английский язык", { exact: true }).check();
  await modal.getByLabel("Ментальная арифметика", { exact: true }).check();
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/events" &&
      r.request().method() === "POST",
  );
  await modal
    .getByRole("button", { name: "Сохранить мероприятие", exact: true })
    .click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return { ...event, id };
}

function batch(index) {
  return {
    center: `ТЕСТ · Центр ${String(index + 1).padStart(2, "0")}`,
    city: `Тестовый город ${(index % 3) + 1}`,
    teacher: `Тестовый Педагог ${String(index + 1).padStart(2, "0")}`,
    email: `teacher${index + 1}@example.test`,
    phone: `+00000000${String(index + 1).padStart(4, "0")}`,
    teachers: [
      `Тестовый Помощник ${index + 1} А`,
      `Тестовый Помощник ${index + 1} Б`,
    ],
    note: "ТЕСТОВЫЕ ДАННЫЕ — все имена и контакты вымышлены.",
    consent: true,
    students: Array.from({ length: 21 }, (_, i) => {
      const n = index * 21 + i;
      return {
        name: `Тестовый Участник ${String(n + 1).padStart(3, "0")}`,
        birth: `${2013 + (n % 6)}-04-${String((n % 27) + 1).padStart(2, "0")}`,
        grade: n % 7,
        subjects:
          n % 3 === 0
            ? [subjects[0]]
            : n % 3 === 1
              ? subjects.slice(1)
              : subjects,
      };
    }),
  };
}

async function registerUi(page, event, data) {
  await page.goto(base + `/events/${event.id}/register`);
  await expect(page.locator(".reg-telegram-link")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Вставить список", exact: true })
    .click();
  await page
    .getByLabel("Список учеников", { exact: true })
    .fill(
      data.students
        .map((s) =>
          [
            s.name,
            s.birth.split("-").reverse().join("."),
            s.grade,
            s.subjects.join(", "),
          ].join("\t"),
        )
        .join("\n"),
    );
  await page
    .getByRole("button", { name: "Добавить учеников", exact: true })
    .click();
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(
    data.students.length,
  );
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  for (const [label, value] of [
    ["Образовательный центр", data.center],
    ["Город центра", data.city],
    ["ФИО ответственного учителя", data.teacher],
    ["Контактный телефон", data.phone],
  ])
    await page.getByLabel(label, { exact: false }).fill(value);
  await page.getByLabel("Email", { exact: false }).fill(data.email);
  for (let i = 0; i < data.teachers.length; i++) {
    await page
      .getByRole("button", { name: "Добавить педагога", exact: true })
      .click();
    await page
      .getByLabel(`ФИО дополнительного учителя ${i + 1}`, { exact: true })
      .fill(data.teachers[i]);
  }
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.locator(".reg-consent input").check();
  const received = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/registrations" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  const response = await received;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  await expect(
    page.getByRole("heading", { name: "Ваша команда в списке!", exact: true }),
  ).toBeVisible();
  expect(receipt.count).toBe(data.students.length);
  return receipt;
}

async function labelTestScreenshot(page, text) {
  await page.evaluate((text) => {
    document.querySelector("#launch-test-label")?.remove();
    const label = document.createElement("div");
    label.id = "launch-test-label";
    label.textContent = text;
    Object.assign(label.style, {
      position: "fixed",
      left: "12px",
      bottom: "12px",
      zIndex: "99999",
      background: "#192851",
      color: "#ffffff",
      padding: "10px 16px",
      font: "600 13px sans-serif",
      border: "1px solid #d7ef75",
      borderRadius: "8px",
      boxShadow: "0 3px 16px #0003",
      pointerEvents: "none",
    });
    document.body.append(label);
  }, text);
}

async function noOverflow(page, widths, label) {
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    const bounds = await page.evaluate(() => ({
      viewport: innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    if (
      bounds.html > bounds.viewport + 1 ||
      bounds.body > bounds.viewport + 1
    ) {
      console.log(
        "Overflow diagnosis:",
        JSON.stringify(
          await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .map((element) => ({
                class: String(element.className),
                right: element.getBoundingClientRect().right,
                width: element.getBoundingClientRect().width,
              }))
              .filter((element) => element.right > innerWidth + 1),
          ),
        ),
      );
      await page.screenshot({
        path: join(artifacts, "overflow-diagnosis.png"),
        fullPage: false,
      });
    }
    expect(
      bounds.html,
      `${label}: document overflow at ${width}`,
    ).toBeLessThanOrEqual(bounds.viewport + 1);
    expect(
      bounds.body,
      `${label}: body overflow at ${width}`,
    ).toBeLessThanOrEqual(bounds.viewport + 1);
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
}

async function revealHome(page) {
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 650) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      y,
    );
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(700);
}

async function captureHome(page) {
  await page.goto(base);
  await expect(
    page
      .locator('a[href="https://www.instagram.com/iqland_competitions/"]')
      .first(),
  ).toBeVisible();
  await noOverflow(page, [320, 390, 768, 1024, 1440], "Home");
  await revealHome(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await labelTestScreenshot(
    page,
    "ТЕСТОВЫЙ СТЕНД · новый дизайн · вымышленные мероприятия",
  );
  await page.screenshot({
    path: join(artifacts, "home-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".directions-section").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -110));
  await labelTestScreenshot(
    page,
    "ТЕСТОВЫЙ СТЕНД · новый дизайн · вымышленные мероприятия",
  );
  await page.screenshot({
    path: join(artifacts, "home-directions-desktop.png"),
    fullPage: false,
  });
  await page.locator(".discovery-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifacts, "home-discovery-desktop.png"),
    fullPage: false,
  });
  await page.locator(".contact-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifacts, "home-instagram-desktop.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 768, height: 1100 });
  await revealHome(page);
  await page.locator(".directions-section").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.screenshot({
    path: join(artifacts, "home-directions-tablet.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 320, height: 1000 });
  await revealHome(page);
  await page.locator(".directions-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifacts, "home-directions-mobile.png"),
    fullPage: false,
  });
  await page.locator(".contact-section").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifacts, "home-instagram-mobile.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
}

function compareEntries(a, b) {
  return (
    a.event_date.localeCompare(b.event_date) ||
    a.subject.localeCompare(b.subject, "ru") ||
    a.grade - b.grade ||
    (b.score ?? -1) - (a.score ?? -1) ||
    a.name.localeCompare(b.name, "ru")
  );
}

function rank(row, entries) {
  return row.score === null
    ? ""
    : 1 +
        entries.filter(
          (r) =>
            r.status !== "cancelled" &&
            r.event_id === row.event_id &&
            r.subject === row.subject &&
            r.grade === row.grade &&
            r.score !== null &&
            r.score > row.score,
        ).length;
}

function workbookValues(sheet) {
  return sheet.getRows(2, sheet.rowCount - 1).map((row) => row.values.slice(1));
}

async function verifyPrivacy(page) {
  await page.goto(base + "/privacy");
  const main = page.locator("main");
  await expect(main).toContainText("IQ LAND, Казахстан");
  await expect(
    main.locator('a[href="https://www.instagram.com/iqland_competitions/"]'),
  ).toHaveText("@iqland_competitions");
  await expect(main).not.toContainText("Эта версия предназначена");
  await expect(
    main.getByRole("heading", { name: "Доступ к результатам", exact: true }),
  ).toBeVisible();
  await expect(main).toContainText(
    "Имена учеников, баллы, места, контакты и даты рождения не публикуются в открытом архиве сайта.",
  );
  for (const unsupportedLegalEntity of ["ООО", "ТОО", "БИН", "LLC", "Ltd."])
    await expect(main).not.toContainText(unsupportedLegalEntity);
  await noOverflow(page, [320, 390, 768, 1024, 1440], "Privacy page");
}

async function runChecks() {
  await startServer();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
  const director = await newPage(),
    admin = await newPage(),
    teacher = await newPage();
  await signIn(
    director,
    accounts.find((u) => u.role === "director"),
  );
  await expect(
    director.getByRole("button", { name: "Рекламный блок", exact: true }),
  ).toHaveCount(0);
  const mainEvent = await createInDirectorUi(director, eventData());
  console.log("PASS: director signed in and created test event through UI");
  expect(
    (await api(director, "/manage")).events.find((e) => e.id === mainEvent.id)
      .telegramUrl,
  ).toBe(inviteA);

  // A director may edit the invite, not just add it during creation.
  await director
    .locator(".event-manage-list > div")
    .filter({ hasText: mainEvent.city })
    .getByRole("button", { name: "Изменить", exact: true })
    .click();
  await director.getByLabel(telegramLabel, { exact: true }).fill(inviteB);
  await director
    .getByLabel(telegramLabel, { exact: true })
    .scrollIntoViewIfNeeded();
  await labelTestScreenshot(
    director,
    "ТЕСТОВЫЕ ДАННЫЕ · руководитель добавляет Telegram-канал мероприятия",
  );
  await director.screenshot({
    path: join(artifacts, "director-telegram-field.png"),
    fullPage: false,
  });
  const edited = director.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/events/${mainEvent.id}` &&
      r.request().method() === "PUT",
  );
  await director
    .getByRole("button", { name: "Сохранить мероприятие", exact: true })
    .click();
  expect((await edited).ok()).toBe(true);
  await expect(director.getByRole("dialog")).toHaveCount(0);
  expect(
    (await api(director, "/manage")).events.find((e) => e.id === mainEvent.id)
      .telegramUrl,
  ).toBe(inviteB);
  await api(director, `/events/${mainEvent.id}`, {
    method: "PUT",
    data: mainEvent,
  });
  const secondary = {
    ...eventData({
      title: "ТЕСТ · Другая группа",
      city: "Тестоград Второй",
      date: "2037-06-14",
      telegramUrl: inviteB,
    }),
    ...(await api(director, "/events", {
      method: "POST",
      data: eventData({
        title: "ТЕСТ · Другая группа",
        city: "Тестоград Второй",
        date: "2037-06-14",
        telegramUrl: inviteB,
      }),
    })),
  };
  const noGroup = {
    ...eventData({
      title: "ТЕСТ · Без группы",
      city: "Тестоград Третий",
      date: "2037-07-14",
      telegramUrl: "",
    }),
    ...(await api(director, "/events", {
      method: "POST",
      data: eventData({
        title: "ТЕСТ · Без группы",
        city: "Тестоград Третий",
        date: "2037-07-14",
        telegramUrl: "",
      }),
    })),
  };
  const publicEvents = await api(teacher, "/events");
  for (const event of publicEvents)
    expect(Object.hasOwn(event, "telegramUrl")).toBe(false);
  expect(
    JSON.stringify(await api(teacher, `/events/${mainEvent.id}`)),
  ).not.toContain(inviteA);
  expect(
    JSON.stringify(await api(teacher, `/events/${mainEvent.id}`)),
  ).not.toContain("telegram");
  expect(
    (
      await director.request.put(base + `/api/events/${mainEvent.id}/archive`, {
        data: { video: "", resultsPublished: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await director.request.put(base + "/api/promo", { data: {} })).status(),
  ).toBe(403);
  expect((await teacher.request.get(base + "/api/manage")).status()).toBe(401);
  expect((await teacher.request.get(base + "/api/export")).status()).toBe(401);
  checks.push(
    "Director creates and edits event/invite; archive and promo remain admin-only; public APIs do not expose invite.",
  );
  console.log("PASS: per-event staff permissions and private invitations");
  await captureHome(teacher);
  console.log(
    "PASS: landing responsive checks and desktop/tablet/mobile visual captures ready",
  );
  if (process.argv.includes("--capture-home-only")) {
    await verifyPrivacy(teacher);
    await teacher.screenshot({
      path: join(artifacts, "privacy-desktop.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(unexpectedResponses).toEqual([]);
    console.log(
      "PASS: capture-only landing and Kazakhstan/Instagram privacy details",
    );
    return;
  }

  const registrations = [];
  const firstData = batch(0);
  const first = await registerUi(teacher, mainEvent, firstData);
  registrations.push(first);
  expect(first.telegramUrl).toBe(inviteA);
  await expect(teacher.locator(".reg-telegram-link")).toHaveAttribute(
    "href",
    inviteA,
  );
  await expect(teacher.locator(".reg-telegram-link")).toHaveAttribute(
    "target",
    "_blank",
  );
  const downloaded = teacher.waitForEvent("download");
  await teacher
    .getByRole("button", { name: "Скачать подтверждение", exact: true })
    .click();
  expect(readFileSync(await (await downloaded).path(), "utf8")).toContain(
    inviteA,
  );
  await labelTestScreenshot(
    teacher,
    "ТЕСТОВЫЕ ДАННЫЕ · вымышленная команда · Telegram после регистрации",
  );
  await teacher.locator(".toast").waitFor({ state: "hidden", timeout: 6000 });
  await teacher.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  await teacher.evaluate(() => document.fonts.ready);
  await teacher.screenshot({
    path: join(artifacts, "registration-telegram.png"),
    fullPage: true,
    animations: "disabled",
  });
  await noOverflow(
    teacher,
    [320, 390, 768, 1024, 1440],
    "Registration success with Telegram",
  );
  for (let b = 1; b < 12; b++) {
    const result = await api(teacher, "/registrations", {
      method: "POST",
      data: { ...batch(b), eventId: mainEvent.id },
    });
    expect(result).toMatchObject({ count: 21, telegramUrl: inviteA });
    registrations.push(result);
  }
  const otherData = {
    ...batch(20),
    teachers: [],
    students: [
      {
        name: "Тестовый Второе Событие",
        birth: "2015-04-01",
        grade: 5,
        subjects: [subjects[0]],
      },
    ],
  };
  const secondReceipt = await registerUi(teacher, secondary, otherData);
  expect(secondReceipt.telegramUrl).toBe(inviteB);
  await expect(teacher.locator(".reg-telegram-link")).toHaveAttribute(
    "href",
    inviteB,
  );
  const emptyReceipt = await registerUi(teacher, noGroup, {
    ...otherData,
    center: "ТЕСТ · Без группы",
    students: [{ ...otherData.students[0], name: "Тестовый Нет Группы" }],
  });
  expect(emptyReceipt.telegramUrl).toBe("");
  await expect(teacher.locator(".reg-telegram")).toHaveCount(0);
  checks.push(
    "Three real browser registration flows: 21-student team with invite and receipt TXT, another event's distinct invite, and no group.",
  );
  console.log(
    "PASS: all 254 fictional students registered, three UI success flows and receipt download",
  );

  for (let i = 0; i < registrations.length; i++) {
    const status = i >= 10 ? "cancelled" : i < 8 ? "confirmed" : "new";
    await api(director, `/registrations/${registrations[i].id}/status`, {
      method: "PATCH",
      data: { status },
    });
  }
  let manage = await api(director, "/manage");
  const primaryRows = manage.entries.filter((r) => r.event_id === mainEvent.id);
  expect(primaryRows.length).toBe(504);
  expect(new Set(primaryRows.map((r) => r.student_id)).size).toBe(252);
  const groups = new Map();
  for (const row of primaryRows.filter((r) => r.status !== "cancelled")) {
    const key = `${row.subject}|${row.grade}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const scores = [
    100,
    100,
    95,
    90,
    90,
    85,
    80,
    75,
    70,
    65,
    60,
    55,
    50,
    45,
    40,
    35,
    20,
    0,
    null,
    null,
  ];
  expect(groups.size).toBe(21);
  for (const rows of groups.values()) {
    expect(rows.length).toBe(20);
    rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    for (let i = 0; i < rows.length; i++)
      await api(director, `/entries/${rows[i].id}`, {
        method: "PATCH",
        data: { score: scores[i] },
      });
  }
  // A cancelled team's perfect scores must not displace an active team.
  for (const row of primaryRows.filter((r) => r.status === "cancelled"))
    await api(director, `/entries/${row.id}`, {
      method: "PATCH",
      data: { score: 100 },
    });
  manage = await api(director, "/manage");
  const active = manage.entries
    .filter((r) => r.event_id === mainEvent.id && r.status !== "cancelled")
    .sort(compareEntries);
  expect(active.length).toBe(420);
  expect(new Set(active.map((r) => r.student_id)).size).toBe(210);
  expect(active.filter((r) => r.score === null).length).toBe(42);
  expect(active.filter((r) => r.score === 0).length).toBe(21);
  console.log(
    "PASS: 252-student primary event scored, 2 cancelled teams, 420 active protocol entries",
  );

  await director.goto(base + "/cabinet");
  await director
    .getByLabel("Олимпиада", { exact: true })
    .selectOption(mainEvent.id);
  await expect(director.locator(".manage-table tbody tr")).toHaveCount(12);
  await director
    .getByLabel("Статус заявки", { exact: true })
    .selectOption("cancelled");
  await expect(director.locator(".manage-table tbody tr")).toHaveCount(2);
  await director.getByLabel("Статус заявки", { exact: true }).selectOption("");
  await director.getByLabel("Поиск", { exact: true }).fill("Центр 03");
  await expect(director.locator(".manage-table tbody tr")).toHaveCount(1);
  await director.getByLabel("Поиск", { exact: true }).fill("");
  await director
    .getByRole("button", { name: "Протокол олимпиады", exact: true })
    .click();
  await expect(director.locator(".protocol-table tbody tr")).toHaveCount(420);
  const actualRows = await director
    .locator(".protocol-table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        name: row.querySelector("td strong").textContent,
        score: row.querySelector(".score-input").value,
        place: row.querySelector(".place-badge").textContent,
      })),
    );
  expect(actualRows).toEqual(
    active.map((row) => ({
      name: row.name,
      score: String(row.score ?? ""),
      place: String(rank(row, active) || "—"),
    })),
  );
  await expect(
    director.locator(".stat-card").nth(0).locator("strong"),
  ).toHaveText("210");
  await expect(
    director.locator(".stat-card").nth(1).locator("strong"),
  ).toHaveText("10");
  await expect(
    director.locator(".stat-card").nth(2).locator("strong"),
  ).toHaveText("30");
  await labelTestScreenshot(
    director,
    "ТЕСТОВЫЕ ДАННЫЕ · 252 ученика в заявках · 210 активных · 420 участий в протоколе",
  );
  await director.screenshot({
    path: join(artifacts, "protocol-252-students.png"),
    fullPage: false,
  });
  await noOverflow(
    director,
    [320, 390, 768, 1024, 1440],
    "Dashboard 420 protocol rows",
  );

  await director
    .getByLabel("Дисциплина", { exact: true })
    .selectOption(subjects[0]);
  await director.getByLabel("Класс", { exact: true }).selectOption("5");
  await expect(director.locator(".protocol-table tbody tr")).toHaveCount(20);
  expect(await director.locator(".place-badge").allTextContents()).toEqual([
    "1",
    "1",
    "3",
    "4",
    "4",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "—",
    "—",
  ]);
  const firstName = await director
    .locator(".protocol-table tbody tr")
    .first()
    .locator("strong")
    .textContent();
  await director.getByLabel("Поиск", { exact: true }).fill(firstName);
  await expect(director.locator(".protocol-table tbody tr")).toHaveCount(1);
  await expect(director.locator(".place-badge")).toHaveText("1");
  await director.getByLabel("Поиск", { exact: true }).fill("");
  await director.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  await director.screenshot({
    path: join(artifacts, "protocol-mathematics-grade5.png"),
    fullPage: true,
    animations: "disabled",
  });
  await director.setViewportSize({ width: 390, height: 1000 });
  await director.screenshot({
    path: join(artifacts, "protocol-mobile.png"),
    fullPage: false,
  });
  await director.setViewportSize({ width: 1600, height: 1100 });
  checks.push(
    "252 fictional participants / 12 teams; 2 cancellations excluded; all 420 protocol rows sorted and ranked, score 0, ties 1/1/3, unscored, search/status/subject/grade filters and mobile widths.",
  );
  console.log(
    "PASS: protocol sorting, tied ranks, filters, responsive dashboard and screenshots",
  );

  // Download while table filters are active: the UI explicitly exports the
  // entire selected event, rather than silently exporting a partial protocol.
  const workbookDownloaded = director.waitForEvent("download");
  await director
    .getByRole("button", { name: "Скачать Excel", exact: true })
    .click();
  const workbookFile = join(artifacts, "IQ-LAND-252-TEST.xlsx");
  await (await workbookDownloaded).saveAs(workbookFile);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookFile);
  expect(workbook.worksheets.map((s) => s.name)).toEqual([
    "Участники",
    "Протокол",
    "Учителя",
  ]);
  const participantValues = workbookValues(workbook.getWorksheet("Участники"));
  const protocolValues = workbookValues(workbook.getWorksheet("Протокол"));
  const teacherValues = workbookValues(workbook.getWorksheet("Учителя"));
  expect(participantValues.length).toBe(252);
  expect(new Set(participantValues.map((r) => r[3])).size).toBe(252);
  expect(participantValues.filter((r) => r[12] === "Отменена").length).toBe(42);
  expect(protocolValues.length).toBe(420);
  expect(
    protocolValues.map((r) => ({
      name: r[3],
      score: r[5] ?? null,
      place: r[6] ?? "",
    })),
  ).toEqual(
    active.map((r) => ({
      name: r.name,
      score: r.score,
      place: rank(r, active),
    })),
  );
  expect(teacherValues.length).toBe(36);
  expect(new Set(teacherValues.map((r) => r[0])).size).toBe(36);
  expect(teacherValues.filter((r) => r[7] === "Отменена").length).toBe(6);
  for (const sheet of workbook.worksheets) {
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  }
  expect(workbook.getWorksheet("Протокол").getCell("F2").type).toBe(
    ExcelJS.ValueType.Number,
  );
  const allExport = await director.request.get(base + "/api/export");
  expect(allExport.ok()).toBe(true);
  const allWorkbook = new ExcelJS.Workbook();
  await allWorkbook.xlsx.load(await allExport.body());
  expect(allWorkbook.getWorksheet("Участники").rowCount - 1).toBe(254);
  expect(allWorkbook.getWorksheet("Протокол").rowCount - 1).toBe(422);
  expect(allWorkbook.getWorksheet("Учителя").rowCount - 1).toBe(38);
  checks.push(
    "Unmodified real Excel export verified cell-by-cell: 252 unique participants, 420 protocol entries, 36 teachers; cancellation statuses, numeric scores, tied ranks, frozen headers, filters, all three sheets.",
  );
  checks.push(
    "Unfiltered all-event Excel export also contains the two isolated event registrations: 254 participants, 422 active entries, 38 teachers.",
  );
  console.log(
    "PASS: actual downloaded XLSX all 3 sheets verified cell-by-cell",
  );

  await signIn(
    admin,
    accounts.find((u) => u.role === "admin"),
  );
  const past = { ...mainEvent, date: "2020-05-14", deadline: "2020-05-01" };
  await api(admin, `/events/${mainEvent.id}`, { method: "PUT", data: past });
  expect(JSON.stringify(await api(teacher, "/archive"))).not.toContain(
    "telegram",
  );
  expect(
    JSON.stringify(await api(teacher, `/archive/${mainEvent.id}`)),
  ).not.toContain(inviteA);
  await api(admin, `/events/${mainEvent.id}/archive`, {
    method: "PUT",
    data: { video: "", resultsPublished: true },
  });
  const recap = await api(teacher, `/archive/${mainEvent.id}`);
  expect(recap.results).toEqual([]);
  expect(recap.resultsPublished).toBe(false);

  for (const forbidden of [
    "@example.test",
    "+00000000",
    "Тестовый Педагог",
    "telegramUrl",
    inviteA,
    "2013-04-",
  ])
    expect(JSON.stringify(recap)).not.toContain(forbidden);
  await teacher.goto(base + `/archive/${mainEvent.id}`);
  await expect(teacher.locator(".recap-results-table tbody tr")).toHaveCount(
    0,
  );
  await noOverflow(
    teacher,
    [320, 390, 768, 1024, 1440],
    "Archive keeps 378 scored participants private",
  );
  await api(admin, `/events/${mainEvent.id}/archive`, {
    method: "PUT",
    data: { video: "", resultsPublished: false },
  });
  await api(admin, `/events/${mainEvent.id}`, {
    method: "PUT",
    data: mainEvent,
  });
  checks.push(
    "Archive hides every student and score even if a legacy client requests publication; no teacher contacts, birth dates or Telegram invite in public archive.",
  );

  // Unmount dashboard polling before our deliberate outage. Its automatic
  // 15-second refresh should not become a false network failure in this test.
  await director.goto("about:blank");
  await admin.goto("about:blank");
  await stopServer();
  await startServer();
  const persisted = await api(director, "/manage");
  expect(
    persisted.registrations.filter((r) => r.event_id === mainEvent.id).length,
  ).toBe(12);
  expect(
    persisted.entries.filter((r) => r.event_id === mainEvent.id).length,
  ).toBe(504);
  expect(persisted.events.find((e) => e.id === mainEvent.id).telegramUrl).toBe(
    inviteA,
  );
  expect(
    persisted.entries.filter(
      (r) =>
        r.event_id === mainEvent.id &&
        r.status !== "cancelled" &&
        r.score === 0,
    ).length,
  ).toBe(21);
  await teacher.goto(base + `/events/${mainEvent.id}/register`);
  await expect(teacher.locator(".reg-students")).toBeVisible();
  await noOverflow(teacher, [320, 390, 768, 1024, 1440], "Registration form");
  await verifyPrivacy(teacher);
  checks.push(
    "Registrations, statuses, scores, staff sessions and per-event invite persist across server restart; Instagram contact and responsive home/registration/receipt/dashboard/archive checked at 320/390/768/1024/1440px.",
  );
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(unexpectedResponses).toEqual([]);

  const report = {
    syntheticData: true,
    productionTouched: false,
    event: mainEvent.title,
    primaryEvent: {
      submittedParticipants: 252,
      teams: 12,
      entriesIncludingCancelled: 504,
      activeParticipants: 210,
      activeTeams: 10,
      activeEntries: 420,
      scoredActiveEntries: 378,
      unscoredActiveEntries: 42,
      zeroScores: 21,
      cancelledParticipants: 42,
      cancelledTeams: 2,
      cancelledEntries: 84,
      teachersIncludingCancelled: 36,
      activeTeachers: 30,
    },
    workbook: {
      participants: 252,
      protocolEntries: 420,
      teachers: 36,
      file: workbookFile,
    },
    otherIsolatedEvents: { events: 2, participants: 2 },
    consoleErrors: errors,
    failedRequests,
    unexpectedResponses,
    checks,
  };
  writeFileSync(
    join(artifacts, "qa-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "PASS: launch QA, real registrations, 252-student Excel, roles, invitations, privacy, persistence and responsive pages",
  );
}

try {
  await runChecks();
} finally {
  await browser?.close();
  await stopServer();
  rmSync(dir, { recursive: true, force: true });
}
