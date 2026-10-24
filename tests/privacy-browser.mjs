import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { awardsFixture, eventPayload } from "./awards-fixture.mjs";
import { LANGUAGES, translate } from "../shared/i18n/index.js";
import { CONSENT_TEXT, PRIVACY_SECTIONS, PRIVACY_VERSION } from "../shared/privacy.js";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = resolve("../artifacts/iq-land-privacy-audit");
mkdirSync(artifacts, { recursive: true });
const environment = {
  IQLAND_LEGAL_NAME: "ТЕСТ · ИП <Организатор>", IQLAND_LEGAL_ID: "123456789012",
  IQLAND_LEGAL_ADDRESS: "ТЕСТ · Казахстан, учебный адрес", IQLAND_PRIVACY_EMAIL: "privacy@example.test",
  IQLAND_STORAGE_COUNTRY: "ТЕСТ · Казахстан",
};
const api = await awardsFixture({ environment });
let browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ locale: "ru-RU", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(api.base + "/privacy");
  for (const { code } of LANGUAGES) {
    await page.evaluate((language) => localStorage.setItem("iqland:language", language), code);
    await page.goto(api.base + "/privacy");
    await expect(page.getByRole("heading", { name: translate("Обработка персональных данных", code), exact: true })).toBeVisible();
    for (const [heading, text] of PRIVACY_SECTIONS) {
      await expect(page.locator("main")).toContainText(translate(heading, code));
      await expect(page.locator("main")).toContainText(translate(text, code));
    }
    await expect(page.locator("main")).toContainText(translate(CONSENT_TEXT, code));
    await expect(page.locator(".legal-details")).toContainText("ТЕСТ · ИП <Организатор>");
    await expect(page.locator(".legal-details")).toContainText("123456789012");
    await expect(page.locator('main a[href="mailto:privacy@example.test"]')).toBeVisible();
    await expect(page.locator("main")).toContainText(PRIVACY_VERSION);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (code === "ru" || code === "kk") await page.screenshot({ path: join(artifacts, `privacy-${code}-${width}.png`), fullPage: true });
    }
  }
  const id = await api.create(eventPayload({ date: "2099-10-03", deadline: "2099-09-20" }));
  await page.evaluate(() => localStorage.setItem("iqland:language", "ru"));
  await page.goto(api.base + `/events/${id}/register`);
  await page.getByLabel("ФИО ученика 1", { exact: true }).fill("ТЕСТ Ученик");
  await page.getByLabel("Дата рождения ученика 1", { exact: true }).fill("2015-03-15");
  await page.getByLabel("Класс ученика 1", { exact: true }).selectOption("5");
  await page.locator(".reg-footer-actions .btn-primary").click();
  for (const [label, value] of [["Образовательный центр", "ТЕСТ Центр"], ["Город центра", "ТЕСТ Город"], ["ФИО ответственного учителя", "ТЕСТ Учитель"], ["Email", "teacher@example.test"], ["Контактный телефон", "+77001234567"]])
    await page.getByLabel(label).fill(value);
  await page.locator(".reg-footer-actions .btn-primary").click();
  await expect(page.locator(".reg-consent")).toContainText(CONSENT_TEXT);
  await expect(page.locator(".reg-consent input")).not.toBeChecked();
  await page.locator(".reg-consent input").check();
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/registrations") && response.request().method() === "POST");
  await page.locator(".reg-footer-actions .btn-primary").click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  const consent = api.withDb((db) => db.prepare("SELECT * FROM registration_consents WHERE registration_id=?").get(receipt.id));
  expect(consent.confirmation).toBe(CONSENT_TEXT);
  expect(consent.policy_version).toBe(PRIVACY_VERSION);
  expect(JSON.parse(consent.notice).organizer.name).toBe("ТЕСТ · ИП <Организатор>");
  environment.IQLAND_REGISTRATION_PAUSED = "true";
  await api.stop(); await api.start();
  await page.goto(api.base + `/events/${id}/register`);
  await expect(page.getByRole("heading", { name: "Приём заявок приостановлен", exact: true })).toBeVisible();
  await expect(page.locator(".reg-students")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+7 (701) 220-15-94", exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
  console.log("PASS: all privacy text in five languages, real configured organiser details, 390/1440px, unchecked adult/parent authority confirmation, actual registration with matching durable evidence, paused intake screen without student fields.");
  console.log("Artifacts: " + artifacts);
} finally {
  await browser?.close();
  await api.close();
}
