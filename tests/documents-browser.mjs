import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { awardsFixture, eventPayload, today } from "./awards-fixture.mjs";
import { criteriaPdf, criteriaDocx } from "./document-fixtures.mjs";
import { translate, LANGUAGES } from "../shared/i18n/index.js";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = resolve(process.env.IQLAND_DOCUMENT_ARTIFACTS || "../artifacts/iq-land-documents");
mkdirSync(artifacts, { recursive: true });
const api = await awardsFixture();
let browser;
const errors = [], checks = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const staff = await browser.newPage({ locale: "ru-RU", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  staff.on("pageerror", (error) => errors.push(error.message));
  const director = api.accounts.find((a) => a.role === "director");
  await staff.goto(api.base + "/login");
  await staff.getByLabel("Email", { exact: true }).fill(director.email);
  await staff.getByLabel("Пароль", { exact: true }).fill(director.password);
  await staff.getByRole("button", { name: "Войти в кабинет", exact: true }).click();
  await staff.waitForURL(api.base + "/cabinet");
  await staff.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await staff.getByRole("button", { name: "Добавить", exact: true }).click();
  const modal = staff.getByRole("dialog");
  for (const [label, value] of [["Название олимпиады", "ТЕСТ · Документы олимпиады"], ["Город", "Лондон"], ["Страна", "Великобритания"], ["Дата олимпиады", today], ["Приём заявок до", today], ["Описание", "Тестовая олимпиада с критериями и положением."]])
    await modal.getByLabel(label, { exact: true }).fill(value);
  const input = modal.getByLabel("Файлы с критериями · необязательно", { exact: true });
  await input.setInputFiles({ name: "invalid.html", mimeType: "text/html", buffer: Buffer.from("<html>not allowed</html>") });
  await expect(modal.locator(".document-upload-error")).toContainText("Поддерживаются");
  await input.setInputFiles([
    { name: "Критерии математики.pdf", mimeType: "application/pdf", buffer: criteriaPdf() },
    { name: "Положение олимпиады.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: criteriaDocx() },
  ]);
  await expect(modal.locator(".event-documents li")).toHaveCount(2);
  await expect(modal.getByRole("button", { name: "Сохранить мероприятие", exact: true })).toBeEnabled();
  await modal.locator(".event-documents-uploader").screenshot({ path: join(artifacts, "organizer-document-upload.png") });
  await modal.getByRole("button", { name: "Сохранить мероприятие", exact: true }).click();
  await expect(modal).toHaveCount(0);
  let events = (await api.request("/manage", { cookie: api.director })).data.events;
  const event = events.find((e) => e.city === "Лондон");
  expect(event.documents).toHaveLength(2);
  await api.create(eventPayload({ city: "Токио", title: "ТЕСТ · Без документов" }));
  // Editing and saving through the interface retains uploaded criteria.
  await staff.locator(".event-manage-list > div").filter({ hasText: "Лондон" }).getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(modal.locator(".event-documents li")).toHaveCount(2);
  await modal.getByRole("button", { name: "Сохранить мероприятие", exact: true }).click();
  await expect(modal).toHaveCount(0);
  checks.push("Director creates and edits an olympiad, uploads real PDF and DOCX, and invalid formats show a useful error.");
  const page = await browser.newPage({ locale: "ru-RU", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  for (const { code } of LANGUAGES) {
    await page.goto(api.base);
    await page.evaluate((code) => localStorage.setItem("iqland:language", code), code);
    await page.reload();
    const card = page.locator(".event-card").filter({ hasText: translate("Лондон", code) });
    await card.getByRole("button", { name: translate("Критерии и документы олимпиады", code), exact: true }).click();
    const details = page.getByRole("dialog");
    await expect(details.locator(".event-documents li")).toHaveCount(2);
    for (const link of await details.locator(".event-documents a").all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await details.locator(".event-documents").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    if (code === "ru") {
      await details.locator(".event-documents").screenshot({ path: join(artifacts, "event-criteria-links.png") });
      const popupPromise = page.waitForEvent("popup");
      await details.locator(`a[href="${event.documents[0].url}"]`).click();
      const popup = await popupPromise;
      await expect(popup).toHaveURL(api.base + event.documents[0].url);
      await expect.poll(() => popup.frames().some((frame) => frame.url().startsWith("chrome-extension:"))).toBe(true);
      const viewer = popup.frames().find((frame) => frame.url().startsWith("chrome-extension:"));
      await expect(viewer.locator("pdf-viewer")).toBeVisible();
      await popup.screenshot({ path: join(artifacts, "pdf-new-tab.png") });
      await popup.close();
    }
  }
  checks.push("Event listing opens only the selected olympiad documents. PDF opens in a separate tab; links and layout work in five languages at 320–1440 px.");
  await page.goto(api.base);
  await page.evaluate(() => localStorage.setItem("iqland:language", "ru"));
  await page.goto(api.base + `/events/${event.id}/register`);
  await page.getByLabel("ФИО ученика 1", { exact: true }).fill("ТЕСТ Участник Документов");
  await page.getByLabel("Дата рождения ученика 1", { exact: true }).fill("2015-03-15");
  await page.getByLabel("Класс ученика 1", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  for (const [name, value] of [["Образовательный центр", "ТЕСТ Документы"], ["Город центра", "Астана"], ["ФИО ответственного учителя", "ТЕСТ Учитель Документов"], ["Email", "documents@example.test"], ["Контактный телефон", "+77001234567"]])
    await page.getByLabel(name).fill(value);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваша команда в списке!", exact: true })).toBeVisible();
  await expect(page.locator(".reg-success .event-documents li")).toHaveCount(2);
  expect(await page.locator(".reg-success .event-documents a").evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(event.documents.map((doc) => doc.url));
  await page.locator(".event-documents").screenshot({ path: join(artifacts, "registration-criteria-links.png") });
  checks.push("A real team registration shows exactly its olympiad PDF and Word documents on the success screen.");
  await staff.goto(api.base + "/cabinet");
  await staff.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await staff.locator(".event-manage-list > div").filter({ hasText: "Лондон" }).getByRole("button", { name: "Изменить", exact: true }).click();
  await modal.getByRole("button", { name: "Убрать файл Положение олимпиады.docx", exact: true }).click();
  await expect(modal.locator(".event-documents li")).toHaveCount(1);
  await modal.getByRole("button", { name: "Сохранить мероприятие", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect((await api.request("/events/" + event.id)).data.documents).toHaveLength(1);
  await page.goto(api.base);
  await page.locator(".event-card").filter({ hasText: "Лондон" }).getByRole("button", { name: "Критерии и документы олимпиады", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".event-documents li")).toHaveCount(1);
  checks.push("Removing a document and saving the event removes its public link without affecting other criteria.");
  expect(errors).toEqual([]);
  writeFileSync(join(artifacts, "qa-report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.map((check) => "PASS: " + check).join("\n"));
  console.log("Artifacts: " + artifacts);
} finally {
  await browser?.close();
  await api.close();
}
