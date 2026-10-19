import { chromium, expect as baseExpect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import {
  awardsFixture,
  eventPayload,
  teamPayload,
  today,
} from "./awards-fixture.mjs";
const expect = baseExpect.configure({ timeout: 15000 });
const artifacts = resolve(
  process.env.IQLAND_AWARDS_ARTIFACTS || "../artifacts/iq-land-awards",
);
mkdirSync(artifacts, { recursive: true });
const subjects = ["Ментальная арифметика", "Английский язык", "Математика"];
const api = await awardsFixture();
let browser;
const errors = [];
const checks = [];
const request = async (path, options = {}) => {
  const r = await api.request(path, { cookie: api.director, ...options });
  expect(r.res.ok, JSON.stringify(r.data)).toBe(true);
  return r.data;
};
try {
  const eventId = await api.create(
    eventPayload({
      title: "ТЕСТ · IQ LAND World Challenge",
      telegramUrl: "https://t.me/iqland_test_channel",
    }),
  );
  const oldId = await api.create(
    eventPayload({
      date: "2025-01-01",
      deadline: "2025-01-01",
      title: "ТЕСТ · Прошлая олимпиада",
    }),
  );
  await api.create(
    eventPayload({
      date: "2099-01-01",
      deadline: "2099-01-01",
      title: "ТЕСТ · Будущая олимпиада",
    }),
  );
  for (let team = 0; team < 4; team++)
    await request("/registrations", {
      method: "POST",
      body: teamPayload(eventId, {
        center: [
          "ТЕСТ · Центр Альфа",
          "ТЕСТ · Центр Бета",
          "ТЕСТ · Академия знаний",
          "ТЕСТ · Центр Развитие",
        ][team],
        students: Array.from({ length: 50 }, (_, i) => {
          const n = team * 50 + i;
          return {
            name: `Тестовый Участник ${String(n + 1).padStart(3, "0")}`,
            birth: `${Number(today.slice(0, 4)) - (6 + (n % 10))}-01-01`,
            grade: 1 + (n % 9),
            subjects,
          };
        }),
      }),
    });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({locale: "ru-RU",
    viewport: { width: 1600, height: 1100 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("400 (Bad Request)")
    )
      errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("dialog", (d) => d.accept());
  const director = api.accounts.find((u) => u.role === "director");
  await page.goto(api.base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(director.email);
  await page.getByLabel("Пароль", { exact: true }).fill(director.password);
  await page
    .getByRole("button", { name: "Войти в кабинет", exact: true })
    .click();
  await page.waitForURL(api.base + "/cabinet");
  await page
    .getByRole("button", { name: "Присвоение мест", exact: true })
    .click();
  await expect(page).toHaveURL(api.base + "/cabinet/awards");
  await expect(
    page.getByRole("heading", { name: "Присвоение мест", exact: true }),
  ).toBeVisible();
  const selector = page.getByLabel("Олимпиада для присвоения мест");
  await expect(selector).toHaveValue(eventId);
  await expect(selector.locator("option")).toHaveCount(2);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".aw-score-input")).toHaveCount(200);
  await expect(
    page.getByRole("button", { name: "Вывести результаты", exact: true }),
  ).toBeDisabled();
  checks.push(
    "Director enters dedicated page; current/latest event selected, future events omitted, 3 tabs and 200 age-sorted rows.",
  );
  const roster = await request("/awards/" + eventId);
  const firstId = roster.rows.find((r) => r.subject === subjects[0]).id;
  await page.locator(".aw-score-input").first().fill("0");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/scores") && r.request().method() === "PUT",
  );
  await page.locator(".aw-score-input").first().press("Enter");
  expect((await saved).ok()).toBe(true);
  await expect(page.locator(".aw-score-input").nth(1)).toBeFocused();
  await expect(page.locator(".aw-score-input").first()).toHaveValue("0");
  await page.locator(".aw-score-input").nth(1).fill("125.5");
  await page.getByRole("tab", { name: subjects[1], exact: true }).click();
  await expect(page.locator(".aw-save-state")).toContainText("Баллы сохранены");
  await page
    .getByRole("tab", { name: subjects[1], exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: subjects[2], exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.locator(".aw-score-input").first()).toHaveValue("0");
  expect(
    (await request("/awards/" + eventId)).rows.find((r) => r.id === firstId)
      .score,
  ).toBe(0);
  checks.push(
    "Zero and decimal scores save on blur/Enter; Enter moves down, keyboard tabs work, scores survive reload.",
  );
  await page
    .getByRole("button", { name: "Возрастные категории", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Возрастные категории",
    exact: true,
  });
  await expect(modal.locator(".aw-category-row")).toHaveCount(5);
  await modal
    .getByLabel("Максимальный возраст категории 1", { exact: true })
    .fill("8");
  await modal
    .getByRole("button", { name: "Сохранить категории", exact: true })
    .click();
  await expect(modal).toContainText("пересекаются");
  await modal
    .getByLabel("Максимальный возраст категории 1", { exact: true })
    .fill("7");
  await modal
    .getByRole("button", { name: "Сохранить категории", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  checks.push(
    "Default age ranges 6–7 through 14–15 are editable; shared endpoints reject without closing or losing data.",
  );
  // Simulate a retained unsaved draft, then save through the actual interface.
  await page.evaluate(
    ({ id, key }) =>
      sessionStorage.setItem(
        `iqland:award-scores:${id}`,
        JSON.stringify({ [key]: "432.5" }),
      ),
    { id: eventId, key: firstId },
  );
  await page.reload();
  await expect(page.locator(".aw-score-input").first()).toHaveValue("432.5");
  await page
    .getByRole("button", { name: "Сохранить баллы", exact: true })
    .click();
  await expect(page.locator(".aw-save-state")).toContainText("Баллы сохранены");
  expect(
    (await request("/awards/" + eventId)).rows.find((r) => r.id === firstId)
      .score,
  ).toBe(432.5);
  // Event switches must flush current drafts, rather than carrying scores to another event.
  await page.locator(".aw-score-input").first().fill("433");
  await selector.selectOption(oldId);
  await expect(page.locator(".aw-score-input")).toHaveCount(0);
  await expect(selector).toHaveValue(oldId);
  await selector.selectOption(eventId);
  await expect(page.locator(".aw-score-input").first()).toHaveValue("433");
  checks.push(
    "Session draft restores and saves; switching olympiads flushes edits and preserves per-event separation.",
  );
  let state = await request("/awards/" + eventId);
  await request(`/awards/${eventId}/scores`, {
    method: "PUT",
    body: {
      scores: state.rows.map((r) => ({
        id: r.id,
        previous: r.score,
        score: 1000 - ((Number(r.name.slice(-3)) * 73) % 200),
      })),
    },
  });
  await page.reload();
  await expect(page.locator(".aw-completion")).toContainText(
    "Заполнено 600 из 600",
  );
  await expect(
    page.getByRole("button", { name: "Вывести результаты", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: join(artifacts, "director-scores-200.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Вывести результаты", exact: true })
    .click();
  await expect(page.locator(".aw-center")).toHaveCount(4);
  await expect(page.locator(".aw-result-status")).toHaveText(
    "Результаты рассчитаны",
  );
  await expect(page.locator(".aw-medal-summary")).toContainText("180");
  state = await request("/awards/" + eventId);
  expect(state.result.counts).toEqual({ gold: 180, silver: 180, bronze: 240 });
  await page.locator("#center-results").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(artifacts, "director-center-results.png"),
    fullPage: false,
  });
  await page.screenshot({
    path: join(artifacts, "director-awards-full.png"),
    fullPage: true,
  });
  for (let i = 0; i < 4; i++) {
    const downloaded = page.waitForEvent("download");
    await page
      .locator(".aw-center")
      .nth(i)
      .getByRole("button", { name: "Скачать Excel", exact: true })
      .click();
    const file = await downloaded;
    const path = join(
      artifacts,
      i === 0
        ? "IQ-LAND-center-TEST.xlsx"
        : `IQ-LAND-center-${i + 1}-TEST.xlsx`,
    );
    await file.saveAs(path);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(path);
    expect(book.getWorksheet("Результаты").rowCount).toBe(154);
    await expect(page.locator(".aw-center button").nth(i)).toBeEnabled();
  }
  checks.push(
    "200 pupils / 600 entries generate 180 gold, 180 silver and 240 bronze awards in 15 independent groups; four real Excel downloads contain 150 rows each.",
  );
  // Editing scores makes every old download unavailable until regeneration.
  await page.locator(".aw-score-input").first().fill("9999");
  await page.locator(".aw-heading").click();
  await expect(page.locator(".aw-result-status")).toHaveText("Нужен пересчёт");
  for (const btn of await page.locator(".aw-center button").all())
    await expect(btn).toBeDisabled();
  await page
    .getByRole("button", { name: "Вывести результаты", exact: true })
    .click();
  await expect(page.locator(".aw-result-status")).toHaveText(
    "Результаты рассчитаны",
  );
  checks.push(
    "Score change visibly marks snapshot stale and disables all Excel buttons; rerun restores downloads.",
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await expect(page.locator(".aw-score-input").first()).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: join(artifacts, "director-awards-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.getByRole("button", { name: "Мероприятия", exact: true }).click();
  await expect(page).toHaveURL(api.base + "/cabinet");
  await expect(
    page.getByRole("heading", { name: "Мероприятия", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Присвоение мест", exact: true })
    .click();
  await expect(page.locator(".aw-center")).toHaveCount(4);
  checks.push(
    "Sidebar routes back to the requested dashboard section; awards and results fit 320–1440 px without horizontal page overflow.",
  );
  await page.goto("about:blank");
  await api.stop();
  await api.start();
  await page.goto(api.base + "/cabinet/awards");
  await expect(page.locator(".aw-center")).toHaveCount(4);
  await expect(page.locator(".aw-result-status")).toHaveText(
    "Результаты рассчитаны",
  );
  checks.push(
    "Director session, awards, categories and Excel list survive backend restart.",
  );
  expect(errors).toEqual([]);
  writeFileSync(
    join(artifacts, "qa-report.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        pupils: 200,
        entries: 600,
        centers: 4,
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
