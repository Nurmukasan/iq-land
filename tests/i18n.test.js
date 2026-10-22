import { formatDate } from "../shared/i18n/dates.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import catalog from "../shared/i18n/catalog.json" with { type: "json" };
import {
  translate,
  LANGUAGES,
  browserLanguage,
  languageForCountry,
  exportLanguage,
} from "../shared/i18n/index.js";
import { detectLanguage } from "../server/language.js";
import { parseStudentList } from "../src/lib/registration.js";
import { awardsFixture, eventPayload, teamPayload } from "./awards-fixture.mjs";
import ExcelJS from "exceljs";

test("country defaults and weighted browser fallback select only supported languages", () => {
  for (const [country, lang] of [
    ["KZ", "kk"],
    ["UZ", "uz"],
    ["RU", "ru"],
    ["AZ", "az"],
    ["US", "en"],
    ["DE", "en"],
  ])
    assert.equal(languageForCountry(country, "ru-RU"), lang);
  assert.equal(languageForCountry(null, "ru-RU"), "ru");
  assert.equal(browserLanguage("de-DE,az-AZ;q=0.7,en;q=0.2"), "az");
  assert.equal(browserLanguage("kk;q=0,ru-RU;q=0.9"), "ru");
  assert.equal(browserLanguage("xx"), "en");
  assert.equal(browserLanguage("uz-Latn-UZ"), "uz");
  assert.equal(exportLanguage("*"), "ru");
  assert.equal(exportLanguage(), "ru");
  assert.equal(exportLanguage("kk-KZ"), "kk");
  assert.equal(exportLanguage("en-GB"), "en");
});
test("local IPv4/IPv6 country lookup returns country and language, never the IP address", () => {
  for (const [ip, lang, country] of [
    ["2.72.0.1", "kk", "KZ"],
    ["213.230.64.1", "uz", "UZ"],
    ["94.20.0.1", "az", "AZ"],
    ["77.88.8.8", "ru", "RU"],
    ["8.8.8.8", "en", "US"],
    ["::ffff:2.72.0.1", "kk", "KZ"],
    ["2001:4860:4860::8888", "en", "US"],
  ])
    assert.deepEqual(detectLanguage(ip, "ru-RU"), { language: lang, country });
  for (const ip of ["127.0.0.1", "::1", "10.0.0.1", "bad", "2.72.0.1, 8.8.8.8"])
    assert.deepEqual(detectLanguage(ip, "uz-UZ"), {
      language: "uz",
      country: null,
    });
});
test("every catalog entry has all four translations with exactly the same interpolation slots", () => {
  for (const [source, translations] of Object.entries(catalog))
    for (const { code } of LANGUAGES.filter((l) => l.code !== "ru")) {
      assert.ok(
        typeof translations[code] === "string" && translations[code].trim(),
        source + " " + code,
      );
      const slots = (s) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
      assert.deepEqual(
        slots(translations[code]),
        slots(source),
        source + " " + code,
      );
    }
});
test("translation preserves React nodes, zero, unknown user content, whitespace and interpolated subject labels", () => {
  const node = { type: "b", props: { children: "User content" } };
  assert.equal(translate(node, "en"), node);
  assert.equal(translate(0, "kk"), 0);
  assert.equal(translate("Custom Academy", "az"), "Custom Academy");
  assert.equal(translate("Присвоение мест", "en"), "Award assignment");
  assert.equal(translate("  Баллы\n", "en"), "  Score\n");
  assert.equal(translate("Категория 12–13 лет", "en"), "Category 12–13 years");
  assert.equal(translate("12 лет", "uz"), "12 yosh");
  assert.equal(
    translate("Баллы Алия, Математика", "en"),
    "Score for Алия, Mathematics",
  );
  assert.equal(
    translate("Математика, Английский язык", "az"),
    "Riyaziyyat, İngilis dili",
  );
  assert.equal(translate("Найдено заявок: 0", "kk"), "Табылған өтінімдер: 0");
});
test("registration CSV templates round-trip in all five languages, retaining canonical subject IDs", () => {
  const key = "ФИО;Дата рождения;Класс;Дисциплины Иванов Иван;15.03.2015;5;{0}";
  for (const { code } of LANGUAGES) {
    const csv =
      code === "ru"
        ? "ФИО;Дата рождения;Класс;Дисциплины\nИванов Иван;15.03.2015;5;Математика"
        : translate(key, code, ["Математика"]);
    const parsed = parseStudentList(
      csv,
      ["Математика", "Английский язык"],
      {},
      "2026-10-19",
    );
    assert.deepEqual(parsed.errors, [], code + JSON.stringify(parsed.errors));
    assert.equal(parsed.students[0].subjects[0], "Математика");
    assert.equal(parsed.students[0].birth, "2015-03-15");
  }
});
test("every literal interface message rendered through tr has a catalog entry", () => {
  const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
  function walk(node, file) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "CallExpression" &&
      node.callee?.name === "tr" &&
      node.arguments[0]?.type === "StringLiteral"
    ) {
      const message = node.arguments[0].value.replace(/\s+/g, " ").trim();
      if (/[А-Яа-яЁё]/.test(message))
        assert.ok(catalog[message], file + ": " + message);
    }
    for (const [k, v] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "comments"].includes(k)) continue;
      if (Array.isArray(v)) v.forEach((n) => walk(n, file));
      else if (v && typeof v === "object") walk(v, file);
    }
  }
  for (const file of files("src").filter((f) => f.endsWith(".jsx")))
    walk(
      parse(readFileSync(file, "utf8"), {
        sourceType: "module",
        plugins: ["jsx"],
      }),
      file,
    );
});
test("language endpoint ignores untrusted country/forwarding headers; multilingual exports preserve scores, identities and medal fills", async (t) => {
  const api = await awardsFixture();
  t.after(() => api.close());
  const response = await fetch(api.base + "/api/language", {
    headers: {
      "Accept-Language": "az-AZ",
      "X-Forwarded-For": "2.72.0.1",
      "CF-IPCountry": "UZ",
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { country: null, language: "az" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const id = await api.create(eventPayload());
  await api.request("/registrations", {
    method: "POST",
    body: teamPayload(id, {
      center: "Математика",
      students: [{ ...teamPayload(id).students[0], name: "Математика" }],
    }),
  });
  let state = (await api.request("/awards/" + id, { cookie: api.director }))
    .data;
  await api.request(`/awards/${id}/scores`, {
    cookie: api.director,
    method: "PUT",
    body: {
      scores: state.rows.map((r) => ({ id: r.id, score: 0, previous: null })),
    },
  });
  state = (await api.request("/awards/" + id, { cookie: api.director })).data;
  state = (
    await api.request(`/awards/${id}/generate`, {
      cookie: api.director,
      method: "POST",
      body: { expectedHash: state.inputHash, categories: [{ minAge: 0, maxAge: 99 }] },
    })
  ).data;
  for (const { code } of LANGUAGES) {
    const headers = { Cookie: api.director, "Accept-Language": code };
    const res = await fetch(
      api.base +
        `/api/awards/${id}/centers/${state.result.centers[0].id}/export`,
      { headers },
    );
    assert.equal(res.status, 200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const sheet = book.worksheets[0];
    assert.equal(sheet.name, translate("Результаты", code));
    assert.equal(sheet.getCell("A5").value, translate("Золото", code));
    assert.equal(sheet.getCell("B5").value, translate("Математика", code));
    assert.equal(sheet.getCell("D5").value, "Математика");
    assert.equal(sheet.getCell("G5").value, 0);
    assert.equal(sheet.getCell("A5").fill.fgColor.argb, "FFFFF5DC");
    const general = await fetch(api.base + "/api/export?event=" + id, {
      headers,
    });
    const all = new ExcelJS.Workbook();
    await all.xlsx.load(Buffer.from(await general.arrayBuffer()));
    assert.deepEqual(
      all.worksheets.map((s) => s.name),
      ["Участники", "Протокол", "Учителя"].map((s) => translate(s, code)),
    );
    assert.equal(all.worksheets[0].getCell("D2").value, "Математика");
    assert.equal(all.worksheets[0].getCell("H2").value, "Математика");
  }
});

test("calendar dates have real Kazakh and Uzbek month names without ICU fallback tokens", () => {
  assert.equal(formatDate("2026-10-19", "kk"), "19 қазан 2026 ж.");
  assert.equal(formatDate("2026-10-19", "uz"), "2026-yil 19-oktabr");
  assert.equal(formatDate("2026-10-19", "az"), "19 oktyabr 2026");
  assert.equal(formatDate("2026-10-19", "en"), "19 October 2026");
});

test("interpolation preserves a person’s name even when it matches a translated subject", () => {
  assert.equal(
    translate("Баллы {0}, {1}", "en", ["Математика", "Математика"]),
    "Score for Математика, Mathematics",
  );
});
