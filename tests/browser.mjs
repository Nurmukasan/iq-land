import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ExcelJS from "exceljs";
const dir = mkdtempSync(join(tmpdir(), "iqland-browser-"));
const port = 45000 + Math.floor(Math.random() * 10000),
  base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/index.js"], {
  env: {
    ...process.env,
    IQLAND_SEED_DEMO_EVENTS: "true",
    PORT: String(port),
    DATA_DIR: dir,
  },
  stdio: "ignore",
});
let browser;
const artifacts = resolve(".data/screenshots");
mkdirSync(artifacts, { recursive: true });
async function signIn(page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ),
    page.getByRole("button", { name: "Войти в кабинет", exact: true }).click(),
  ]);
  expect(response.status()).toBe(200);
  await page.waitForURL(base + "/cabinet", { timeout: 30000 });
}
async function revealPage(page) {
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 650) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      y,
    );
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(800);
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ready) throw new Error("API did not start");
  const accounts = JSON.parse(
    readFileSync(join(dir, "initial-accounts.json"), "utf8"),
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await expect(page.locator(".event-card")).toHaveCount(2);
  await expect(
    page
      .locator(".hero-buttons")
      .getByRole("link", { name: "Выбрать олимпиаду" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Следующая олимпиада", exact: true })
    .click();
  await expect(page.locator(".destination-city-row h2")).toContainText(
    "Алматы",
  );
  await page
    .getByRole("button", { name: "Предыдущая олимпиада", exact: true })
    .click();
  await expect(page.locator(".destination-city-row h2")).toContainText("Баку");
  const question = page.getByRole("button", {
    name: "Можно вставить готовый список из Excel?",
    exact: true,
  });
  await question.click();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#faq-1")).toContainText("ФИО");
  await question.click();
  await expect(question).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Математика", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Все направления", exact: true })
    .click();
  await revealPage(page);
  await page.screenshot({
    path: join(artifacts, "home-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Подробнее об олимпиаде в городе Баку" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".event-card")
    .first()
    .getByRole("link", { name: "Зарегистрировать команду" })
    .click();
  await page
    .getByRole("button", { name: "Вставить список", exact: true })
    .click();
  await page
    .getByLabel("Список учеников", { exact: true })
    .fill("Ахметова Алия\t15.03.2015\t5\nИванов Иван\t22.07.2015\t5");
  await page
    .getByRole("button", { name: "Добавить учеников", exact: true })
    .click();
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(2);
  const rows = page.locator(".reg-students tbody tr");
  await rows.nth(0).getByLabel("Математика", { exact: true }).check();
  await rows.nth(1).getByLabel("Математика", { exact: true }).check();
  await rows.nth(1).getByLabel("Английский язык", { exact: true }).uncheck();
  await page.screenshot({
    path: join(artifacts, "registration.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByLabel("Образовательный центр").fill("Демо-центр «Зерде»");
  await page.getByLabel("Город центра").fill("Алматы");
  await page.getByLabel("ФИО ответственного учителя").fill("Тестовый Учитель");
  await page.getByLabel("Контактный телефон").fill("+7 (700) 123-45-67");
  await page.getByLabel("Email", { exact: false }).fill("teacher@example.kz");
  await page.getByRole("button", { name: "Добавить педагога" }).click();
  await page
    .getByLabel("ФИО дополнительного учителя 1")
    .fill("Тестовый Второй Педагог");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.locator(".reg-consent input").check();
  await page
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ваша команда в списке!" }),
  ).toBeVisible();
  await expect(page.locator(".reg-receipt>strong")).toHaveText(/^IQ-/);
  console.log(
    "PASS: public listing, filters, event details, Excel paste, multi-subject team registration, receipt",
  );
  await page.goto(base + "/login");
  const admin = accounts.find((a) => a.role === "admin");
  await page.getByLabel("Email", { exact: true }).fill(admin.email);
  await page.getByLabel("Пароль", { exact: true }).fill(admin.password);
  await signIn(page);
  await expect(page.locator(".manage-table")).toContainText(
    "Демо-центр «Зерде»",
  );
  await page.locator(".status-select").selectOption("confirmed");
  await page
    .getByRole("button", { name: "Протокол олимпиады", exact: true })
    .click();
  await expect(page.locator(".protocol-table tbody tr")).toHaveCount(3);
  const score = page.getByLabel("Баллы Ахметова Алия, Математика");
  await score.fill("95");
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/entries/") && r.request().method() === "PATCH",
  );
  await score.press("Tab");
  await saved;
  await page.getByLabel("Олимпиада", { exact: true }).selectOption("baku-2027");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать Excel", exact: true })
    .click();
  const dl = await downloaded;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await dl.path());
  expect(wb.worksheets.map((s) => s.name)).toEqual([
    "Участники",
    "Протокол",
    "Учителя",
  ]);
  expect(wb.getWorksheet("Участники").rowCount).toBe(3);
  await page.screenshot({
    path: join(artifacts, "dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await page
    .getByRole("button", { name: "Изменить", exact: true })
    .first()
    .click();
  await page.getByLabel("Стоимость · пусто, если уточняется").fill("25000");
  await page
    .getByRole("button", { name: "Сохранить мероприятие", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".event-manage-list")).toContainText("25");
  await page
    .getByRole("button", { name: "Рекламный блок", exact: true })
    .click();
  await page
    .getByLabel("Заголовок", { exact: true })
    .fill("Откройте мир вместе с IQ LAND");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Рекламный блок обновлён",
  );
  await page
    .getByRole("button", { name: "Выйти из кабинета", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  const director = accounts.find((a) => a.role === "director");
  await page.getByLabel("Email", { exact: true }).fill(director.email);
  await page.getByLabel("Пароль", { exact: true }).fill(director.password);
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Мероприятия", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".manage-table")).toContainText(
    "Демо-центр «Зерде»",
  );
  console.log(
    "PASS: admin and director authentication, automatic lists, status, scores, actual XLSX download, event and ad editing, role restrictions",
  );
  const live = await page.request.post(base + "/api/registrations", {
    data: {
      eventId: "baku-2027",
      center: "Автообновление тест",
      city: "Алматы",
      teacher: "Тестовый Учитель",
      email: "live@example.kz",
      phone: "+77001234567",
      teachers: [],
      note: "",
      consent: true,
      students: [
        {
          name: "Тестовый Ученик",
          birth: "2015-03-15",
          grade: 5,
          subjects: ["Математика"],
        },
      ],
    },
  });
  expect(live.status()).toBe(201);
  await expect(page.locator(".manage-table")).toContainText(
    "Автообновление тест",
    { timeout: 20000 },
  );
  console.log("PASS: incoming team appears automatically without page reload");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".workspace-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(artifacts, "dashboard-mobile.png"),
    fullPage: true,
  });
  await page.goto(base);
  await expect(page.locator(".event-card")).toHaveCount(2);
  await revealPage(page);
  await page.screenshot({
    path: join(artifacts, "home-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(
    page.getByRole("navigation", { name: "Главная навигация" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Главная навигация" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page
    .getByRole("navigation", { name: "Главная навигация" })
    .getByRole("link", { name: "Учителям" })
    .click();
  await page.goto(base + "/events/baku-2027/register");
  await expect(
    page.getByRole("heading", { name: "Ученики команды" }),
  ).toBeVisible();
  await page.getByLabel("ФИО ученика 1").fill("Тестовый Ученик");
  await page.getByLabel("Дата рождения ученика 1").fill("2015-03-15");
  await page.getByLabel("Класс ученика 1").selectOption("5");
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(artifacts, "registration-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await expect(page.locator(".event-card")).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  await expect(page.locator(".event-card")).toHaveCount(2);
  expect(
    await page
      .locator(".hero-line")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await expect(page.locator("#about h2")).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
  console.log(
    "PASS: mobile landing, navigation, registration, cabinet; no horizontal page overflow or browser errors",
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  rmSync(dir, { recursive: true, force: true });
}
