import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Run after npm run build. Each run owns its server, database and credentials.
const dir = mkdtempSync(join(tmpdir(), "iqland-registration-browser-"));
const port = 51000 + Math.floor(Math.random() * 9000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/index.js"], {
  env: { ...process.env, IQLAND_SEED_DEMO_EVENTS: "true", PORT: String(port), DATA_DIR: dir },
  stdio: "ignore",
});
let browser;
let releasePost;
const browserErrors = [];

async function newPage({ withoutCrypto = false } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.addInitScript(({ withoutCrypto }) => {
    if (withoutCrypto) {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    } else if (globalThis.crypto) {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    }
  }, { withoutCrypto });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  return page;
}

async function fillStudent(page, index, name, birth, grade) {
  await page.getByLabel(`ФИО ученика ${index}`, { exact: true }).fill(name);
  await page
    .getByLabel(`Дата рождения ученика ${index}`, { exact: true })
    .fill(birth);
  await page
    .getByLabel(`Класс ученика ${index}`, { exact: true })
    .selectOption(String(grade));
}

async function fillContact(page, center = "E2E Регистрация Центр") {
  await page.getByLabel("Образовательный центр").fill(center);
  await page.getByLabel("Город центра").fill("Алматы");
  await page.getByLabel("ФИО ответственного учителя").fill("Тестовый Учитель");
  await page.getByLabel("Контактный телефон").fill("+7 (700) 123-45-67");
  await page
    .getByLabel("Email", { exact: false })
    .fill("registration@example.kz");
}

function continueButton(page) {
  return page.getByRole("button", { name: "Продолжить", exact: true });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error("Registration test API did not start");

  const accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });

  const legacyPage = await newPage({ withoutCrypto: true });
  await legacyPage.goto(base + "/events/baku-2027/register");
  await fillStudent(legacyPage, 1, "Ученик Без Крипто", "2015-03-15", 5);
  await legacyPage.getByRole("button", { name: "Добавить похожего ученика 1", exact: true }).click();
  await expect(legacyPage.locator(".reg-students tbody tr")).toHaveCount(2);
  await expect(legacyPage.getByLabel("Дата рождения ученика 2", { exact: true })).toHaveValue("2015-03-15");
  await expect(legacyPage.getByLabel("ФИО ученика 1", { exact: true })).toHaveValue("Ученик Без Крипто");
  await expect(legacyPage.getByLabel("ФИО ученика 2", { exact: true })).toHaveValue("");
  await legacyPage.getByRole("button", { name: "Добавить 5 строк", exact: true }).click();
  await expect(legacyPage.locator(".reg-students tbody tr")).toHaveCount(7);
  await legacyPage.close();
  console.log("PASS: registration opens and adds/copies rows without Web Crypto");

  // Run the complete registration flow without randomUUID, as on HTTP over LAN.
  const page = await newPage();
  await page.goto(base + "/register");
  await expect(page.locator(".reg-choice")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Выбрать олимпиаду в городе Баку",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(base + "/events/baku-2027/register");
  await expect(page.locator(".reg-event-banner")).toContainText("Баку");

  await continueButton(page).click();
  await expect(
    page.getByLabel("ФИО ученика 1", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Дата рождения ученика 1")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByLabel("Класс ученика 1", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("ФИО ученика 1", { exact: true })).toBeFocused();

  await page
    .locator("summary")
    .filter({ hasText: "Общие настройки команды" })
    .click();
  await page
    .getByLabel("Класс для новых учеников", { exact: true })
    .selectOption("5");
  await page
    .locator(".reg-bulk-subjects")
    .getByLabel("Математика", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Применить ко всем", exact: true })
    .click();
  await expect(page.getByLabel("Класс ученика 1", { exact: true })).toHaveValue(
    "5",
  );
  // An unnamed row with other information must survive both import attempts.
  await page.getByLabel("Дата рождения ученика 1").fill("2014-04-10");
  await page
    .getByRole("button", { name: "Вставить список", exact: true })
    .click();
  const importDialog = page.getByRole("dialog", {
    name: "Вставить список учеников",
  });
  await importDialog
    .getByLabel("Список учеников", { exact: true })
    .fill(
      "ФИО\tДата рождения\tКласс\nИванов Иван\t15.03.2015\t5\nОшибка Ученик\t31.02.2015\t5",
    );
  await importDialog
    .getByRole("button", { name: "Добавить учеников", exact: true })
    .click();
  await expect(importDialog.locator(".reg-import-errors")).toContainText(
    "Строка 3",
  );
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("Дата рождения ученика 1")).toHaveValue(
    "2014-04-10",
  );

  await importDialog
    .getByLabel("Список учеников", { exact: true })
    .fill("ФИО\tДата рождения\tКласс\nАхметова Алия\t15.03.2015\t5");
  await importDialog
    .getByRole("button", { name: "Добавить учеников", exact: true })
    .click();
  await expect(importDialog).toHaveCount(0);
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(2);
  await expect(page.getByLabel("Дата рождения ученика 1")).toHaveValue(
    "2014-04-10",
  );
  await expect(page.getByLabel("Класс ученика 2", { exact: true })).toHaveValue(
    "5",
  );
  await expect(
    page
      .locator(".reg-students tbody tr")
      .nth(1)
      .getByLabel("Математика", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("ФИО ученика 1", { exact: true }).fill("Садыков Тимур");
  await page
    .locator(".reg-students tbody tr")
    .first()
    .getByLabel("Английский язык", { exact: true })
    .uncheck();
  await continueButton(page).click();
  await fillContact(page, "   ");
  await continueButton(page).click();
  await expect(page.getByLabel("Образовательный центр")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Образовательный центр")).toBeFocused();
  await page.getByLabel("Образовательный центр").fill("E2E Регистрация Центр");
  await page
    .getByRole("button", { name: "Добавить педагога", exact: true })
    .click();
  await page
    .getByLabel("ФИО дополнительного учителя 1", { exact: true })
    .fill("Второй Педагог");
  await continueButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Проверьте заявку", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reg-review-students > div")).toHaveCount(2);

  let posts = 0;
  const postReleased = new Promise((resolve) => {
    releasePost = resolve;
  });
  await page.route("**/api/registrations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1;
    await postReleased;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Подтвердите согласие");
  expect(posts).toBe(0);
  await page.locator(".reg-consent input").check();
  await page.locator("form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect.poll(() => posts).toBe(1);
  await expect(
    page.getByRole("button", { name: "Отправляем…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".reg-consent input")).toBeDisabled();
  for (const button of await page.locator(".reg-steps button").all())
    await expect(button).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Сменить олимпиаду", exact: true }),
  ).toBeDisabled();
  releasePost();
  await expect(
    page.getByRole("heading", { name: "Ваша команда в списке!", exact: true }),
  ).toBeVisible();
  const receiptId = await page.locator(".reg-receipt > strong").innerText();
  expect(receiptId).toMatch(/^IQ-[A-F0-9]+$/);
  expect(posts).toBe(1);

  const admin = accounts.find((account) => account.role === "admin");
  const login = await page.request.post(base + "/api/auth/login", {
    data: { email: admin.email, password: admin.password },
  });
  expect(login.status()).toBe(200);
  const manageResponse = await page.request.get(base + "/api/manage");
  expect(manageResponse.status()).toBe(200);
  const manage = await manageResponse.json();
  const saved = manage.registrations.find(
    (registration) => registration.id === receiptId,
  );
  expect(saved.center).toBe("E2E Регистрация Центр");
  expect(saved.student_count).toBe(2);
  expect(saved.teachers).toEqual(["Второй Педагог"]);
  const entries = manage.entries.filter(
    (entry) => entry.registration_id === receiptId,
  );
  expect(entries).toHaveLength(3);
  expect(new Set(entries.map((entry) => entry.name))).toEqual(
    new Set(["Садыков Тимур", "Ахметова Алия"]),
  );
  console.log(
    "PASS: chooser, validation, bulk settings, atomic import, consent, one real team submission and saved protocol",
  );

  const draftPage = await newPage();
  await draftPage.goto(base + "/events/baku-2027/register");
  await fillStudent(draftPage, 1, "Черновик Ученик", "2016-02-12", 4);
  await draftPage
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await draftPage.reload();
  await expect(draftPage.locator(".reg-draft-bar")).toBeVisible();
  await draftPage
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(
    draftPage.getByLabel("ФИО ученика 1", { exact: true }),
  ).toHaveValue("Черновик Ученик");
  await expect(draftPage.getByLabel("Дата рождения ученика 1")).toHaveValue(
    "2016-02-12",
  );
  await continueButton(draftPage).click();
  await fillContact(draftPage, "Центр Перенос Команды");
  await draftPage
    .getByRole("button", { name: "Сменить олимпиаду", exact: true })
    .click();
  await draftPage
    .getByRole("dialog")
    .getByRole("button", {
      name: "Выбрать олимпиаду в городе Алматы",
      exact: true,
    })
    .click();
  await expect(draftPage).toHaveURL(base + "/events/almaty-2027/register");
  await expect(
    draftPage.getByRole("heading", { name: "Ученики команды", exact: true }),
  ).toBeVisible();
  await expect(
    draftPage.getByLabel("ФИО ученика 1", { exact: true }),
  ).toHaveValue("Черновик Ученик");
  await expect(
    draftPage.getByLabel("Класс ученика 1", { exact: true }),
  ).toHaveValue("4");
  await expect(
    draftPage
      .locator(".reg-students")
      .getByLabel("Ментальная арифметика", { exact: true }),
  ).toBeChecked();
  await expect(
    draftPage
      .locator(".reg-students")
      .getByLabel("Английский язык", { exact: true }),
  ).toHaveCount(0);
  await continueButton(draftPage).click();
  await expect(draftPage.getByLabel("Образовательный центр")).toHaveValue(
    "Центр Перенос Команды",
  );
  await expect(draftPage.getByLabel("ФИО ответственного учителя")).toHaveValue(
    "Тестовый Учитель",
  );
  console.log(
    "PASS: explicit draft restore after reload and event change preserving team/contact while adapting subjects",
  );

  // Browser history is a different path from a guarded navigation-link click.
  const historyPage = await newPage();
  await historyPage.goto(base + "/register");
  await historyPage
    .getByRole("button", {
      name: "Выбрать олимпиаду в городе Баку",
      exact: true,
    })
    .click();
  await fillStudent(historyPage, 1, "История Ученик", "2015-08-14", 5);
  await historyPage.goBack();
  await expect(historyPage).toHaveURL(base + "/register");
  await expect(historyPage.locator(".reg-choice")).toHaveCount(2);
  await historyPage.goForward();
  await expect(historyPage).toHaveURL(base + "/events/baku-2027/register");
  await expect(historyPage.locator(".reg-draft-bar")).toBeVisible();
  await historyPage
    .getByRole("button", { name: "Восстановить", exact: true })
    .click();
  await expect(
    historyPage.getByLabel("ФИО ученика 1", { exact: true }),
  ).toHaveValue("История Ученик");

  const searchPage = await newPage();
  await searchPage.goto(base + "/events/baku-2027/register");
  await searchPage.getByRole("button", { name: "Добавить 5 строк", exact: true }).click();
  for (let index = 1; index <= 3; index++)
    await searchPage.getByLabel(`ФИО ученика ${index}`, { exact: true }).fill(`Поиск Ученик ${index}`);
  await searchPage.getByRole("button", { name: "Сохранить черновик", exact: true }).click();
  const search = searchPage.getByLabel("Найти ученика в списке", { exact: true });
  await search.fill("Поиск");
  for (let index = 0; index < 3; index++)
    await searchPage.locator(".reg-students tbody tr").first().getByRole("button", { name: /^Удалить ученика/ }).click();
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("Поиск");
  await expect(searchPage.locator(".reg-students tbody tr")).toHaveCount(0);
  await searchPage.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(searchPage.locator(".reg-students tbody tr")).toHaveCount(6);

  // Saving after removing the final pupil must not discard existing contacts.
  const emptyPage = await newPage();
  await emptyPage.goto(base + "/events/baku-2027/register");
  await fillStudent(emptyPage, 1, "Временный Ученик", "2015-01-20", 5);
  await continueButton(emptyPage).click();
  await fillContact(emptyPage, "Центр Без Ученика");
  await emptyPage.locator(".reg-steps button").first().click();
  await emptyPage.getByRole("button", { name: "Удалить ученика 1", exact: true }).click();
  await emptyPage.getByRole("button", { name: "Сохранить черновик", exact: true }).click();
  await emptyPage.reload();
  await emptyPage.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(emptyPage.locator(".reg-students tbody tr")).toHaveCount(1);
  await fillStudent(emptyPage, 1, "Новый Ученик", "2015-01-20", 5);
  await continueButton(emptyPage).click();
  await expect(emptyPage.getByLabel("Образовательный центр")).toHaveValue("Центр Без Ученика");

  // A delayed response belongs to the submitted event even after browser Back.
  const racePage = await newPage();
  await racePage.goto(base + "/events/baku-2027/register");
  await racePage.getByRole("button", { name: "Сменить олимпиаду", exact: true }).click();
  await racePage.getByRole("button", { name: "Выбрать олимпиаду в городе Алматы", exact: true }).click();
  await expect(racePage).toHaveURL(base + "/events/almaty-2027/register");
  await expect(racePage.locator(".reg-event-banner h2")).toContainText("Алматы");
  await fillStudent(racePage, 1, "Асинхронный Ученик", "2015-06-19", 5);
  await continueButton(racePage).click();
  await fillContact(racePage, "Центр Асинхронной Заявки");
  await continueButton(racePage).click();
  await racePage.locator(".reg-consent input").check();
  let racePosts = 0;
  const raceReleased = new Promise((resolve) => { releasePost = resolve; });
  await racePage.route("**/api/registrations", async (route) => {
    racePosts += 1;
    expect(route.request().postDataJSON().eventId).toBe("almaty-2027");
    await raceReleased;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "IQ-BROWSER-RACE", count: 1 }),
    });
  });
  await racePage.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect.poll(() => racePosts).toBe(1);
  await racePage.goBack();
  await expect(racePage).toHaveURL(base + "/events/baku-2027/register");
  await expect(racePage.getByRole("heading", { name: "Ученики команды", exact: true })).toBeVisible();
  await racePage.getByLabel("ФИО ученика 1", { exact: true }).fill("Другая Команда Баку");
  releasePost();
  await expect.poll(() => racePage.evaluate(() => sessionStorage.getItem("iqland:pending-receipt:almaty-2027"))).not.toBeNull();
  await expect(racePage.locator(".reg-receipt")).toHaveCount(0);
  await expect(racePage.getByLabel("ФИО ученика 1", { exact: true })).toHaveValue("Другая Команда Баку");
  await racePage.goForward();
  await expect(racePage).toHaveURL(base + "/events/almaty-2027/register");
  await expect(racePage.locator(".reg-receipt > strong")).toHaveText("IQ-BROWSER-RACE");
  await expect(racePage.locator(".reg-receipt-info")).toContainText("Центр Асинхронной Заявки");
  await expect(racePage.locator(".reg-receipt-info")).toContainText("Алматы");
  expect(await racePage.evaluate(() => sessionStorage.getItem("iqland:pending-receipt:almaty-2027"))).toBeNull();

  expect(browserErrors).toEqual([]);
  console.log(
    "PASS: browser history preserves drafts; filtered search survives row removal and clears on restore; no browser errors",
  );
  console.log("PASS: zero-roster draft keeps contacts; delayed success stays with its event and restores the correct receipt");
} finally {
  releasePost?.();
  await browser?.close();
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await stopped;
  }
  rmSync(dir, { recursive: true, force: true });
}
