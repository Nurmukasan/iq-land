import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import ExcelJS from "exceljs";
import { awardsFixture, eventPayload } from "./awards-fixture.mjs";
import { translate } from "../shared/i18n/index.js";
const expect = baseExpect.configure({ timeout: 20000 });
const artifacts = resolve("../artifacts/iq-land-registration-audit");
mkdirSync(artifacts, { recursive: true });
const api = await awardsFixture(); let browser;
const checks = [], errors = [];
try {
  const id = await api.create(eventPayload({ city: "Лондон", title: "ТЕСТ · Быстрая регистрация" }));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ locale: "ru-RU", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(api.base + `/events/${id}/register`);
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Команда 50");
  sheet.addRow(["№", "Фамилия", "Имя", "Дата рождения"]);
  for (let i = 0; i < 50; i++) sheet.addRow([i + 1, "ТЕСТ", `Ученик ${i + 1}`, i === 25 ? "31.02.2015" : new Date("2015-03-15T00:00:00Z")]);
  workbook.addWorksheet("Другой класс").addRows([["ФИО", "Дата рождения", "Класс"], ["ТЕСТ Другой", "15.03.2015", 4]]);
  await page.getByLabel("Загрузить список учеников из файла").setInputFiles({ name: "team-50.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  const modal = page.getByRole("dialog", { name: "Вставить список учеников", exact: true });
  await expect(modal.getByText("Найдено учеников: 50", { exact: true })).toBeVisible();
  await modal.getByLabel("Лист Excel", { exact: true }).selectOption("1");
  await expect(modal.getByText("Найдено учеников: 1", { exact: true })).toBeVisible();
  await modal.getByLabel("Лист Excel", { exact: true }).selectOption("0");
  await modal.getByLabel("Класс для строк без класса", { exact: true }).selectOption("5");
  await modal.locator(".reg-import-defaults").getByLabel("Ментальная арифметика", { exact: true }).uncheck();
  await modal.locator(".reg-import-defaults").getByLabel("Математика", { exact: true }).check();
  await modal.screenshot({ path: join(artifacts, "import-excel-50.png") });
  await modal.getByRole("button", { name: "Добавить список и исправить ошибки в форме", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(1);
  await expect(page.locator(".reg-count-badge")).toContainText("50");
  await page.getByLabel("Дата рождения ученика 26", { exact: true }).fill("2015-02-28");
  await page.getByLabel("ФИО ученика 26", { exact: true }).fill("ТЕСТ Исправленное полное имя");
  await expect(page.getByLabel("ФИО ученика 26", { exact: true })).toHaveValue("ТЕСТ Исправленное полное имя");
  await page.getByRole("button", { name: "Показать всех учеников", exact: true }).click();
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(50);
  await expect(page.locator(".reg-autosave")).toHaveText("Черновик сохранён автоматически в этой вкладке");
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await expect(page.locator(".reg-students tbody tr")).toHaveCount(50);
  await expect(page.getByLabel("ФИО ученика 26", { exact: true })).toHaveValue("ТЕСТ Исправленное полное имя");
  await page.getByLabel("ФИО ученика 1", { exact: true }).press("Enter");
  await expect(page.getByLabel("Дата рождения ученика 1", { exact: true })).toBeFocused();
  checks.push("50 pupils from a real multi-sheet XLSX: grade and subjects set once, one invalid date fixed without losing the other 49, automatic draft survives reload, Enter moves to the next field.");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".reg-form-card").screenshot({ path: join(artifacts, "roster-50.png"), style: '.site-header, .toast { visibility: hidden !important; }' });
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  for (const [label, value] of [["Образовательный центр", "ТЕСТ Центр 50"], ["Город центра", "Астана"], ["ФИО ответственного учителя", "ТЕСТ Учитель"], ["Контактный телефон", "+77001234567"], ["Email", "bulk@example.test"]]) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.locator(".reg-consent input").check();
  let posts = 0, firstReceipt; const keys = [];
  await page.route("**/api/registrations", async (route) => {
    posts++; keys.push(route.request().headers()["idempotency-key"]);
    if (posts === 1) { const result = await route.fetch(); expect(result.status()).toBe(201); firstReceipt = await result.json(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByRole("button", { name: "Отправить заявку", exact: true })).toBeEnabled();
  await expect(page.locator(".error-box")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Восстановить", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByLabel("Образовательный центр")).toHaveValue("ТЕСТ Центр 50");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.locator(".reg-consent input").check();
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.locator(".reg-receipt > strong")).toHaveText(firstReceipt.id);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  const manage = (await api.request("/manage", { cookie: api.director })).data;
  expect(manage.registrations).toHaveLength(1); expect(manage.entries).toHaveLength(50);
  expect(manage.entries.every((row) => row.subject === "Математика")).toBe(true);
  const exported = await fetch(api.base + "/api/export?event=" + id, { headers: { Cookie: api.director } });
  const bytes = Buffer.from(await exported.arrayBuffer());
  writeFileSync(join(artifacts, "registration-50-TEST.xlsx"), bytes);
  const output = new ExcelJS.Workbook(); await output.xlsx.load(bytes);
  expect(output.getWorksheet("Участники").rowCount).toBe(51);
  checks.push("A real 50-pupil submission survives a deliberately lost server response and page reload: restored retry returns the original receipt, protocol and Excel contain exactly 50 pupils, with no duplicate registration.");
  const large = await browser.newPage({ locale: "ru-RU", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  large.on("pageerror", (e) => errors.push(e.message));
  large.on("dialog", (dialog) => dialog.accept());
  await large.goto(api.base + `/events/${id}/register`);
  const text = "ФИО\tДата рождения\tКласс\n" + Array.from({ length: 300 }, (_, i) => `ТЕСТ Большая команда ${i + 1}\t15.03.2015\t5`).join("\n");
  // Use a real ClipboardEvent so the application sees the entire rectangular paste.
  await large.getByLabel("ФИО ученика 1", { exact: true }).evaluate((element, text) => {
    const data = new DataTransfer(); data.setData("text/plain", text); element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  const largeModal = large.getByRole("dialog");
  await expect(largeModal.getByText("Найдено учеников: 300", { exact: true })).toBeVisible();
  await largeModal.getByRole("button", { name: "Добавить учеников", exact: true }).click();
  await expect(large.locator(".reg-students tbody tr")).toHaveCount(300);
  expect(await large.locator(".reg-student-scroll").evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(650);
  await large.getByLabel("ФИО ученика 1", { exact: true }).fill("ТЕСТ Отредактированная строка 300");
  await expect(large.getByLabel("ФИО ученика 1", { exact: true })).toHaveValue("ТЕСТ Отредактированная строка 300");
  checks.push("Pasting a 300-row table directly into the name field opens the import preview; every row is retained and the roster stays within a scrollable desktop area.");
  const international = await browser.newPage({ locale: "en-GB", viewport: { width: 390, height: 1000 }, reducedMotion: "reduce" });
  international.on("pageerror", (error) => errors.push(error.message));
  for (const [code, header] of [
    ["ru", "ФИО;Дата рождения;Класс;Дисциплины"],
    ["kk", "Аты-жөні;Туған күні;Сыныбы;Пәндер"],
    ["en", "Full name;Date of birth;Grade;Subjects"],
    ["az", "Ad və soyad;Doğum tarixi;Sinif;Fənlər"],
    ["uz", "F.I.Sh.;Tug‘ilgan sana;Sinf;Fanlar"],
  ]) {
    await international.goto(api.base);
    await international.evaluate((code) => localStorage.setItem("iqland:language", code), code);
    await international.goto(api.base + `/events/${id}/register`);
    await expect(international.locator("html")).toHaveAttribute("lang", code);
    await international.getByRole("button", { name: translate("Вставить список", code), exact: true }).click();
    const dialog = international.getByRole("dialog");
    await dialog.getByLabel(translate("Список учеников", code), { exact: true }).fill(header + "\nTEST Student;15.03.2015;5;" + translate("Математика", code));
    await expect(dialog.getByText(translate("Найдено учеников: {0}", code, [1]), { exact: true })).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await international.setViewportSize({ width, height: 1000 });
      expect(await international.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), code + " " + width).toBe(true);
    }
    await dialog.getByRole("button", { name: translate("Добавить учеников", code), exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(international.locator(".reg-students tbody tr")).toHaveCount(1);
  }
  checks.push("The import dialog recognizes headings and subject labels in all five languages and fits 320–1440 px.");
  expect(errors).toEqual([]);
  writeFileSync(join(artifacts, "qa-report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.map((c) => "PASS: " + c).join("\n"));
  console.log("Artifacts: " + artifacts);
} finally { await browser?.close(); await api.close(); }
