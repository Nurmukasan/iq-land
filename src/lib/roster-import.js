import { LANGUAGES, translate } from "../../shared/i18n/index.js";
import { makeStudent, validateStudent } from "./registration.js";

export const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;
const normal = (value) => String(value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const aliases = {
  name: ["фио", "фамилияимяотчество", "full name", "student name", "student", "аты-жөні", "оқушыныңатыжөні", "ad və soyad", "adsoyad", "fish", "oquvchiningfish"],
  surname: ["фамилия", "surname", "last name", "тегі", "soyad", "familiya"],
  firstName: ["имя", "first name", "аты", "ad", "ism"],
  patronymic: ["отчество", "middle name", "әкесініңаты", "ataadi", "otasiningismi"],
  birth: ["дата рождения", "датарожд", "birth", "birth date", "date of birth", "dob", "туғанкүні", "туғанкүн", "doğum tarixi", "tugilgan sana", "tugilgansanasi"],
  grade: ["класс", "grade", "class", "сынып", "сыныбы", "sinif", "sinf"],
  subjects: ["дисциплины", "дисциплина", "предметы", "предмет", "subject", "subjects", "disciplines", "пәндер", "пән", "fənlər", "fənn", "fanlar", "fan"],
};
const headerField = (cell) => Object.entries(aliases).find(([, values]) => values.some((v) => normal(v) === normal(cell)))?.[0];
const subjectAliases = {
  "Математика": ["math", "maths", "mathematics", "матем"],
  "Английский язык": ["english", "english language", "английский", "англ", "ағылшын"],
  "Ментальная арифметика": ["mental arithmetic", "mental arithmetics", "ментальная арифметика"],
};
function headerMap(row) {
  const map = {};
  row.forEach((cell, index) => { const field = headerField(cell); if (field && map[field] === undefined) map[field] = index; });
  // "Name" is a full name unless a separate surname column exists.
  const name = row.findIndex((cell) => ["name", "атыжөні"].includes(normal(cell)));
  if (map.name === undefined && name >= 0) map[map.surname === undefined ? "name" : "firstName"] = name;
  return map.birth !== undefined && (map.name !== undefined || map.firstName !== undefined || map.surname !== undefined) ? map : null;
}
export function rosterDate(value, date1904 = false) {
  const text = String(value ?? "").trim();
  if (/^\d{5}(?:\.0+)?$/.test(text)) {
    const serial = Number(text);
    return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  let match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : text;
}
export function rosterGrade(value) {
  const text = String(value ?? "").trim();
  if (["дошкольник", "дошкольники", "preschool", "kindergarten", "мектепкедейінгі", "məktəbəqədər", "maktabgacha"].some((word) => normal(word) === normal(text))) return "0";
  const match = /^(\d{1,2})(?:\s*[-.]?\s*(?:класс|grade|class|сынып|сыныбы|sinif|sinf|[a-zа-яәғқңөұүһі]))?$/iu.exec(text.replace(/["'«»]/g, "")) || /^(?:grade|class|year)\s+(\d{1,2})$/iu.exec(text);
  return match ? String(Number(match[1])) : text;
}
function delimitedRows(text) {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 10);
  const detected = ["\t", ";", ","].find((separator) => sample.some((line) => headerMap(line.split(separator).map((cell) => cell.replace(/^"|"$/g, "")))));
  const delimiter = detected || (sample.some((line) => line.includes("\t")) ? "\t" : sample.some((line) => line.includes(";")) ? ";" : ",");
  const rows = [], lines = [];
  let row = [], field = "", quoted = false, line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || !field.trim())) {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); rows.push(row); lines.push(start);
      row = []; field = ""; start = ++line;
    } else { field += char; if (char === "\n") line++; }
  }
  row.push(field.trim()); rows.push(row); lines.push(start);
  return { rows, lines, quoted };
}
export function previewRoster(text, availableSubjects, defaults = {}, today) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  if (source.length > 2_000_000) return { students: [], errors: [{ line: 0, message: "Список слишком большой. В одной заявке — до 300 учеников." }], fatal: true };
  const { rows, lines, quoted } = delimitedRows(source);
  const header = rows.slice(0, 10).findIndex((row) => headerMap(row));
  const map = header >= 0 ? headerMap(rows[header]) : { name: 0, birth: 1, grade: 2, subjects: 3 };
  const students = [], errors = [];
  let fatal = quoted;
  if (quoted) errors.push({ line: lines.at(-1), message: "Проверьте кавычки и разделители в списке." });
  for (let index = header >= 0 ? header + 1 : 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.every((cell) => !cell.trim())) continue;
    if (students.length >= 300) { errors.push({ line: lines[index], message: "В одной заявке может быть не более 300 учеников." }); fatal = true; break; }
    if (header < 0 && row.length > 4) {
      errors.push({ line: lines[index], message: "Нужны три столбца: ФИО, дата рождения, класс. Четвёртый — дисциплины через запятую." });
      fatal = true;
      continue;
    }
    const get = (key) => map[key] === undefined ? "" : row[map[key]] || "";
    const name = get("name") || [get("surname"), get("firstName"), get("patronymic")].filter(Boolean).join(" ");
    const student = makeStudent(availableSubjects, {
      ...defaults, name: name.replace(/\s+/g, " ").trim(), birth: rosterDate(get("birth")),
      grade: get("grade") ? rosterGrade(get("grade")) : (defaults.grade ?? ""),
    });
    if (get("subjects")) student.subjects = [...new Set(get("subjects").split(/[,;|]/).map((subject) =>
      availableSubjects.find((candidate) => LANGUAGES.some(({ code }) => normal(translate(candidate, code)) === normal(subject)) || subjectAliases[candidate]?.some((alias) => normal(alias) === normal(subject))) || subject.trim(),
    ))];
    const messages = Object.values(validateStudent(student, availableSubjects, today));
    if (messages.length) errors.push({ line: lines[index], message: messages.join(" "), messages });
    students.push(student);
  }
  if (!students.length && !errors.length) errors.push({ line: 0, message: "Добавьте хотя бы одну строку с учеником." });
  return { students, errors, fatal };
}
function checkWorkbookSize(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error("Не удалось прочитать Excel. Сохраните файл в формате XLSX или CSV.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), total = 0;
  if (count > 2000 || !count) throw Error("Файл Excel слишком сложный. Оставьте только таблицу с учениками.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw Error("Не удалось прочитать Excel. Сохраните файл в формате XLSX или CSV.");
    total += view.getUint32(offset + 24, true);
    if (total > 50 * 1024 * 1024) throw Error("Файл Excel слишком сложный. Оставьте только таблицу с учениками.");
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
}
const cellText = (value) => {
  if (value instanceof Date) return Number.isFinite(+value) ? value.toISOString().slice(0, 10) : "";
  if (value && typeof value === "object") {
    if ("result" in value) return cellText(value.result);
    if (value.richText) return value.richText.map((part) => part.text).join("");
    return value.text || "";
  }
  return String(value ?? "");
};
const quote = (value) => /[\t\n\r"]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
export async function readRosterFile(file) {
  if (file.size > MAX_ROSTER_FILE_BYTES) throw Error("Список больше 5 МБ. Оставьте только данные учеников.");
  const ext = file.name.split(".").at(-1).toLowerCase();
  if (!["xlsx", "csv", "tsv", "txt"].includes(ext)) throw Error("Выберите XLSX, CSV, TSV или TXT. Старый XLS сначала сохраните как XLSX.");
  const buffer = await file.arrayBuffer();
  if (ext !== "xlsx") {
    let text;
    if (new Uint8Array(buffer)[0] === 0xff && new Uint8Array(buffer)[1] === 0xfe) text = new TextDecoder("utf-16le").decode(buffer);
    else if (new Uint8Array(buffer)[0] === 0xfe && new Uint8Array(buffer)[1] === 0xff) text = new TextDecoder("utf-16be").decode(buffer);
    else { try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { text = new TextDecoder("windows-1251").decode(buffer); } }
    return [{ name: file.name, text }];
  }
  checkWorkbookSize(buffer);
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); } catch { throw Error("Не удалось прочитать Excel. Сохраните файл в формате XLSX или CSV."); }
  if (book.worksheets.length > 30) throw Error("Файл Excel слишком сложный. Оставьте только таблицу с учениками.");
  const sheets = book.worksheets.filter((sheet) => sheet.state !== "hidden" && sheet.state !== "veryHidden").map((sheet) => {
    const rows = [];
    sheet.eachRow((row) => {
      if (rows.length >= 310 || row.cellCount > 50) throw Error("Список слишком большой. В одной заявке — до 300 учеников.");
      rows.push(Array.from({ length: Math.min(row.cellCount, 50) }, (_, i) => cellText(row.getCell(i + 1).value)));
    });
    const header = rows.slice(0, 10).map(headerMap).find(Boolean);
    const birthColumn = header?.birth ?? 1;
    if (book.properties.date1904) for (const row of rows)
      if (/^\d{5}$/.test(row[birthColumn] || "")) row[birthColumn] = rosterDate(row[birthColumn], true);
    return { name: sheet.name, text: rows.map((row) => row.map(quote).join("\t")).join("\n") };
  }).filter((sheet) => sheet.text.trim());
  if (!sheets.length) throw Error("Добавьте хотя бы одну строку с учеником.");
  return sheets;
}
