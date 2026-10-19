import catalog from "./catalog.json" with { type: "json" };
import { isLanguage } from "./languages.js";
const normalize = (value) => value.replace(/\s+/g, " ").trim();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrasePattern = (value) => escape(value).replace(/\s+/g, "\\s+");
const padding = (value, translated) =>
  value.match(/^\s*/)[0] + translated + value.match(/\s*$/)[0];
// Interpolated identities and organizer content remain unchanged. Only known
// interface labels inside these specific slots are localized recursively.
const translatedSlots = new Map([
  ["Баллы {0}, {1}", [1]],
  ["Категория {0}", [0]],
  ["Заявку в городе {0} отправить не удалось: {1}", [1]],
  ["ФИО;Дата рождения;Класс;Дисциплины Иванов Иван;15.03.2015;5;{0}", [0]],
  [
    "IQ LAND Номер заявки: {0} Олимпиада: {1}, {2} Центр: {3} Учитель: {4} Учеников: {5} Статус: получена, ожидает подтверждения организатором.{6}",
    [6],
  ],
]);
const patternCache = Object.entries(catalog)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([source, messages]) => {
    const numbers = [];
    let at = 0,
      pattern = "^";
    for (const match of source.matchAll(/\{(\d+)\}/g)) {
      pattern += phrasePattern(source.slice(at, match.index)) + "([\\s\\S]*?)";
      numbers.push(Number(match[1]));
      at = match.index + match[0].length;
    }
    return {
      pattern: new RegExp(pattern + phrasePattern(source.slice(at)) + "$", "u"),
      numbers,
      source,
      messages,
    };
  });
const subjects = new Set([
  "Математика",
  "Английский язык",
  "Ментальная арифметика",
]);
export function translate(value, language = "ru", values) {
  if (Array.isArray(value))
    return value.map((item) => translate(item, language));
  if (typeof value !== "string" || !isLanguage(language) || !value.trim())
    return value;
  if (language === "ru")
    return values
      ? value.replace(/\{(\d+)\}/g, (_, index) =>
          String(values[Number(index)] ?? `{${index}}`),
        )
      : value;
  const normalized = normalize(value);
  const format = (template, params, source = normalized) =>
    template.replace(/\{(\d+)\}/g, (_, index) => {
      const part = params?.[Number(index)] ?? `{${index}}`;
      return String(
        translatedSlots.get(source)?.includes(Number(index))
          ? translate(part, language)
          : part,
      );
    });
  const direct = catalog[normalized]?.[language];
  if (direct !== undefined) {
    const translated = values ? format(direct, values) : direct;
    return padding(value, translated);
  }
  if (/^\d+\s+(год|года|лет)$/.test(normalized))
    return format(catalog["{0} лет"][language], [normalized.split(" ")[0]]);
  if (
    normalized.includes(", ") &&
    normalized.split(", ").every((part) => subjects.has(part))
  )
    return normalized
      .split(", ")
      .map((part) => translate(part, language))
      .join(", ");
  for (const entry of patternCache) {
    const match = entry.pattern.exec(value.trim());
    if (match && entry.messages[language]) {
      const params = [];
      entry.numbers.forEach((number, index) => {
        params[number] = match[index + 1];
      });
      return padding(
        value,
        format(entry.messages[language], params, entry.source),
      );
    }
  }
  return value;
}
export {
  LANGUAGES,
  browserLanguage,
  languageForCountry,
  intlLocale,
  isLanguage,
  exportLanguage,
} from "./languages.js";
