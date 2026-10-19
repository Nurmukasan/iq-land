import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { awardsFixture, eventPayload, today } from "./awards-fixture.mjs";
import { translate as t, LANGUAGES } from "../shared/i18n/index.js";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = resolve(
  process.env.IQLAND_I18N_ARTIFACTS || "../artifacts/iq-land-languages",
);
mkdirSync(artifacts, { recursive: true });
const api = await awardsFixture();
let browser;
const errors = [],
  checks = [];
const request = async (path, options = {}) => {
  const r = await api.request(path, { cookie: api.director, ...options });
  expect(r.res.ok, JSON.stringify(r.data)).toBe(true);
  return r.data;
};
async function switchLanguage(page, code) {
  await page.locator(".language-trigger").click();
  await page
    .getByRole("menuitemradio", {
      name: new RegExp(
        LANGUAGES.find((l) => l.code === code).name.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
      ),
    })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", code);
}
async function noOverflow(page, label) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        { message: label + " " + width },
      )
      .toBe(true);
  }
}
async function noRussian(page, label) {
  const nodes = await page.locator("body").evaluate((body) => {
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const values = [];
    let node;
    while ((node = walk.nextNode())) {
      if (node.parentElement.closest('script,style,[lang="ru"]')) continue;
      const text = node.textContent.trim();
      if (/[А-Яа-яЁё]/.test(text) && node.parentElement.getClientRects().length)
        values.push(text);
    }
    return values;
  });
  expect(nodes, label).toEqual([]);
}
try {
  const id = await api.create(
    eventPayload({
      title: "GLOBAL OLYMPIAD TEST",
      city: "Алматы",
      country: "Казахстан",
      description: "An international competition for every curious mind.",
      includes: ["Участие в олимпиаде", "Сертификат участника"],
      telegramUrl: "https://t.me/iqland_test_channel",
      price: 15000,
    }),
  );
  const past = await api.create(
    eventPayload({
      title: "PAST OLYMPIAD TEST",
      date: "2025-10-03",
      deadline: "2025-10-03",
      city: "Baku",
      country: "Azerbaijan",
      description: "Highlights and memories.",
      includes: ["Participation"],
    }),
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    locale: "en-GB",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let countryRequests = 0;
  await page.route("**/api/language", (route) => {
    countryRequests++;
    return route.fulfill({ json: { country: "KZ", language: "kk" } });
  });
  await page.goto(api.base);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Кеңірек ойла.",
  );
  await expect(page.locator(".language-trigger")).toContainText("KK");
  checks.push(
    "First visit from Kazakhstan selects Kazakh, even with an English browser.",
  );
  for (const code of ["en", "kk", "az", "uz", "ru"]) {
    await switchLanguage(page, code);
    await expect(
      page.getByRole("navigation", { name: t("Главная навигация", code) }),
    ).toBeVisible();
    await expect(page.locator(".hero-description")).toContainText(
      t("Математика, английский и ментальная арифметика.", code),
    );
    if (["en", "az", "uz"].includes(code))
      await noRussian(page, "Landing " + code);
    await noOverflow(page, "Landing " + code);
    if (code === "en") {
      for (const [width, height] of [
        [320, 900],
        [390, 900],
        [640, 320],
      ]) {
        await page.setViewportSize({ width, height });
        await page.locator(".language-trigger").click();
        const bounds = await page.getByRole("menu").boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
        await page.keyboard.press("Escape");
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      scrollTo(0, 0);
    });
    await page.screenshot({
      path: join(artifacts, "home-" + code + ".png"),
      fullPage: false,
    });
    if (code === "en" || code === "kk") {
      if (code === "kk")
        await page.setViewportSize({ width: 390, height: 900 });
      await page.locator(".language-trigger").click();
      await expect(page.getByRole("menuitemradio")).toHaveCount(5);
      await page.screenshot({
        path: join(
          artifacts,
          code === "en" ? "language-menu.png" : "language-menu-mobile.png",
        ),
        fullPage: false,
      });
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  checks.push(
    "Home, navigation, subjects, FAQ, contacts and metadata translate across five languages and fit 320–1440 px.",
  );
  await switchLanguage(page, "az");
  const beforeRequests = countryRequests;
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "az");
  expect(countryRequests).toBe(beforeRequests);
  expect(
    await page.evaluate(() => localStorage.getItem("iqland:language")),
  ).toBe("az");
  checks.push(
    "Manual selection persists after reload and takes precedence over the IP-derived language.",
  );
  // Open keyboard menu, select without a pointer and retain the current page.
  await page.locator(".language-trigger").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator(".language-trigger")).toBeFocused();
  await page.goto(api.base + "/events/" + id + "/register");
  await expect(page.locator(".reg-student-row")).toHaveCount(1);
  const name = page.getByLabel(t("ФИО ученика {0}", "ru", [1]), {
    exact: true,
  });
  await name.fill("Математика");
  await page
    .getByLabel(t("Дата рождения ученика {0}", "ru", [1]), { exact: true })
    .fill("2014-03-15");
  await page
    .getByLabel(t("Класс ученика {0}", "ru", [1]), { exact: true })
    .selectOption("6");
  for (const code of ["en", "kk", "az", "uz", "ru"]) {
    await switchLanguage(page, code);
    await expect(
      page.getByLabel(t("ФИО ученика {0}", code, [1]), { exact: true }),
    ).toHaveValue("Математика");
    await expect(
      page.getByLabel(t("Класс ученика {0}", code, [1]), { exact: true }),
    ).toHaveValue("6");
    await expect(
      page.getByRole("button", { name: t("Продолжить", code), exact: true }),
    ).toBeVisible();
  }
  checks.push(
    "Changing language preserves student names, dates, grades, selected subjects and form step. Keyboard switching works.",
  );
  await switchLanguage(page, "en");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel(t("Образовательный центр", "en") + " *", { exact: true })
    .fill("Математика");
  await page
    .getByLabel(t("Город центра", "en") + " *", { exact: true })
    .fill("Almaty");
  await page
    .getByLabel(t("ФИО ответственного учителя", "en") + " *", { exact: true })
    .fill("Математика");
  await page
    .getByLabel("Email *", { exact: true })
    .fill("teacher@example.test");
  await page
    .getByLabel(t("Контактный телефон", "en") + " *", { exact: true })
    .fill("+77001234567");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".reg-review-students")).toContainText(
    "Математика",
  );
  await expect(page.locator(".reg-review-students")).toContainText(
    "Mental arithmetic",
  );
  await page.getByRole("checkbox").last().check();
  await page
    .getByRole("button", { name: "Submit application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your team is on the list!",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".reg-telegram-link")).toHaveAttribute(
    "href",
    "https://t.me/iqland_test_channel",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download receipt", exact: true })
    .click();
  const receipt = await download;
  await receipt.saveAs(join(artifacts, "receipt-en.txt"));
  expect(readFileSync(join(artifacts, "receipt-en.txt"), "utf8")).toContain(
    "Teacher: Математика",
  );
  const management = await request("/manage");
  const entry = management.entries.find((e) => e.event_id === id);
  expect(entry.subject).toBe("Ментальная арифметика");
  expect(entry.name).toBe("Математика");
  expect(management.registrations[0].center).toBe("Математика");
  checks.push(
    "A real English-language team registration sends canonical subject IDs, preserves identities and shows the correct Telegram channel and translated TXT receipt.",
  );
  for (const code of ["en", "kk", "az", "uz", "ru"]) {
    await switchLanguage(page, code);
    await page.goto(api.base + "/privacy");
    await expect(
      page.getByRole("heading", {
        name: t("Обработка персональных данных", code),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText(
      t("Автоматический выбор языка", code),
    );
    if (["en", "az", "uz"].includes(code))
      await noRussian(page, "Privacy " + code);
    await page.goto(api.base + "/archive/" + past);
    await expect(page.locator(".recap-story h2")).toContainText(
      t("Знания, встречи", code),
    );
    await expect(page.locator(".recap-story h2")).toContainText(
      t("и открытия.", code),
    );
    if (["en", "az", "uz"].includes(code))
      await noRussian(page, "Archive " + code);
  }
  const staff = await browser.newPage({
    locale: "en-GB",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  staff.on("pageerror", (e) => errors.push(e.message));
  const account = api.accounts.find((a) => a.role === "director");
  await staff.goto(api.base + "/login");
  await staff.getByLabel("Email", { exact: true }).fill(account.email);
  await staff.getByLabel("Password", { exact: true }).fill(account.password);
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.waitForURL(api.base + "/cabinet");
  await staff
    .getByRole("button", { name: "Award assignment", exact: true })
    .click();
  await expect(
    staff.getByRole("heading", { name: "Award assignment", exact: true }),
  ).toBeVisible();
  await expect(staff.locator(".aw-score-input")).toHaveCount(1);
  for (const code of ["en", "kk", "az", "uz", "ru"]) {
    await switchLanguage(staff, code);
    await expect(
      staff.getByRole("heading", {
        name: t("Присвоение мест", code),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      staff.getByRole("tab", {
        name: t("Ментальная арифметика", code),
        exact: true,
      }),
    ).toBeVisible();
    await noOverflow(staff, "Awards " + code);
  }
  await switchLanguage(staff, "en");
  await staff.locator(".aw-score-input").fill("0");
  await staff.locator(".aw-heading").click();
  await expect(staff.locator(".aw-save-state")).toHaveText("Scores saved");
  await staff
    .getByRole("button", { name: "Calculate results", exact: true })
    .click();
  await expect(staff.locator(".aw-center")).toHaveCount(1);
  await expect(staff.locator(".aw-center h3")).toHaveText("Математика");
  await expect(
    staff.getByRole("button", { name: "Download Excel", exact: true }),
  ).toBeEnabled();
  await staff.setViewportSize({ width: 1440, height: 1000 });
  await staff.screenshot({
    path: join(artifacts, "awards-en.png"),
    fullPage: true,
  });
  checks.push(
    "Director login, subject tabs, scores, age categories and award generation work in translated UI; identities remain unchanged.",
  );
  // A late automatic detection response must not undo an explicit choice.
  const late = await browser.newPage({
    locale: "en-GB",
    reducedMotion: "reduce",
  });
  let release;
  const gate = new Promise((r) => (release = r));
  await late.route("**/api/language", async (route) => {
    await gate;
    await route.fulfill({ json: { country: "KZ", language: "kk" } });
  });
  await late.goto(api.base);
  await switchLanguage(late, "uz");
  release();
  await expect(late.locator("html")).toHaveAttribute("lang", "uz");
  await late.waitForTimeout(300);
  await expect(late.locator("html")).toHaveAttribute("lang", "uz");
  await late.close();
  checks.push(
    "A delayed IP response cannot override a manual choice. No precise geolocation permission or external geolocation request is used.",
  );
  expect(errors).toEqual([]);
  writeFileSync(
    join(artifacts, "qa-report.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        languages: LANGUAGES.map((l) => l.code),
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.map((c) => "PASS: " + c).join("\n"));
  console.log("Artifacts: " + artifacts);
} finally {
  await browser?.close();
  await api.close();
}
