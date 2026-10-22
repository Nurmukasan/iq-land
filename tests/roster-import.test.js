import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { previewRoster, readRosterFile, rosterDate, rosterGrade, MAX_ROSTER_FILE_BYTES } from "../src/lib/roster-import.js";
const subjects = ["Математика", "Английский язык"];
const today = "2026-10-23";
test("school class labels normalize without converting fractional grades or inventing a class", () => {
  for (const value of ["5А", '5 "А"', "5 класс", "5-A", "Grade 5", "05"]) assert.equal(rosterGrade(value), "5");
  for (const value of ["дошкольник", "preschool", "Мектепке дейінгі"]) assert.equal(rosterGrade(value), "0");
  assert.equal(rosterGrade("5.5"), "5.5");
  assert.equal(rosterGrade(""), "");
});

test("bulk import recognizes reordered/split-name headings, extra columns and quoted CSV without losing identities", () => {
  const result = previewRoster('Отчёт центра\n№;Дата рождения;Имя;Класс;Фамилия;Дисциплины;Заметка\n1;1.3.2015;Алия;5;Ахметова;Mathematics;note\n2;2016-2-29;Тимур;4;Петров;English language;note', subjects, {}, today);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.students.map((s) => [s.name, s.birth, s.grade, s.subjects]), [
    ["Ахметова Алия", "2015-03-01", "5", ["Математика"]],
    ["Петров Тимур", "2016-02-29", "4", ["Английский язык"]],
  ]);
  const quoted = previewRoster('Name,Date of birth,Grade,Subjects\n"O\'Neil, Alice",15/03/2015,5,"Mathematics,English language"', subjects, {}, today);
  assert.deepEqual(quoted.errors, []);
  assert.equal(quoted.students[0].name, "O'Neil, Alice");
  assert.deepEqual(quoted.students[0].subjects, subjects);
  assert.equal(previewRoster('"Unclosed;15.03.2015;5', subjects, {}, today).fatal, true);
});
test("50-row paste keeps every incomplete row for correction and fills only omitted grade/subjects from group defaults", () => {
  const text = Array.from({ length: 50 }, (_, i) => `ТЕСТ Ученик ${i + 1}\t${i === 25 ? "31.02.2015" : "15.03.2015"}`).join("\n");
  const result = previewRoster(text, subjects, { grade: "5", subjects: [subjects[1]] }, today);
  assert.equal(result.students.length, 50);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].line, 26);
  assert.equal(result.fatal, false);
  assert.ok(result.students.every((s) => s.grade === "5" && s.subjects[0] === subjects[1]));
  assert.equal(result.students[25].birth, "2015-02-31");
  assert.equal(previewRoster("Тест Ученик;15.03.2020", subjects, { grade: 0 }, today).students[0].grade, 0);
  assert.equal(previewRoster(Array(301).fill("Тест Ученик;15.03.2015;5").join("\n"), subjects, {}, today).fatal, true);
  assert.equal(previewRoster("", subjects, {}, today).students.length, 0);
});
test("actual XLSX imports 50 pupils, dates and cached formulas, supports sheet selection, and preserves multilingual headings", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Ученики");
  sheet.addRow(["Name", "Date of birth", "Grade", "Subjects"]);
  for (let i = 0; i < 50; i++) {
    const row = sheet.addRow([`TEST Student ${i + 1}`, new Date("2015-03-15T00:00:00Z"), { formula: "2+3", result: 5 }, "Mathematics"]);
    row.getCell(2).numFmt = "dd.mm.yyyy";
  }
  book.addWorksheet("Другой класс").addRows([["Аты-жөні", "Туған күні", "Сыныбы"], ["Тест Оқушы", "15.03.2015", "4"]]);
  const hidden = book.addWorksheet("Hidden", { state: "hidden" }); hidden.addRow(["Never import"]);
  const file = new File([await book.xlsx.writeBuffer()], "roster.xlsx");
  const sheets = await readRosterFile(file);
  assert.equal(sheets.length, 2);
  const result = previewRoster(sheets[0].text, subjects, {}, today);
  assert.deepEqual(result.errors, []);
  assert.equal(result.students.length, 50);
  assert.ok(result.students.every((s) => s.birth === "2015-03-15" && s.grade === "5"));
  assert.deepEqual(previewRoster(sheets[1].text, subjects, {}, today).errors, []);
});
test("file import rejects oversized and invalid workbooks, handles UTF-16/CSV and dates without executing formulas", async () => {
  await assert.rejects(readRosterFile(new File([new Uint8Array(MAX_ROSTER_FILE_BYTES + 1)], "large.xlsx")), /5 МБ/);
  await assert.rejects(readRosterFile(new File(["not a workbook"], "bad.xlsx")), /XLSX/);
  await assert.rejects(readRosterFile(new File(["old format"], "old.xls")), /XLS/);
  const text = 'ФИО;Дата рождения;Класс\nТЕСТ Ученик;15.03.2015;5';
  const [csv] = await readRosterFile(new File([Buffer.from("\ufeff" + text, "utf16le")], "list.csv"));
  assert.deepEqual(previewRoster(csv.text, subjects, {}, today).errors, []);
  assert.equal(rosterDate("42078"), "2015-03-15");
  assert.equal(rosterDate("40616", true), "2015-03-15");
  assert.equal(rosterDate("2015"), "2015", "Birth year alone must not silently become an invented birth date");
  assert.equal(previewRoster('ТЕСТ Ученик;=TODAY();5', subjects, {}, today).errors.length, 1);
  const book = new ExcelJS.Workbook(); book.properties.date1904 = true;
  book.addWorksheet("No headings").addRow(["ТЕСТ Ученик", 40616, 5]);
  const sheets = await readRosterFile(new File([await book.xlsx.writeBuffer()], "old-mac.xlsx"));
  assert.equal(previewRoster(sheets[0].text, subjects, {}, today).students[0].birth, "2015-03-15");
});
