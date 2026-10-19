import { formatDate } from "../../shared/i18n/dates.js";
import {
  translate,
  browserLanguage,
  intlLocale,
  isLanguage,
} from "../../shared/i18n/index.js";
export const languageStorageKey = "iqland:language";
export function savedLanguage() {
  try {
    const value = localStorage.getItem(languageStorageKey);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}
let language =
  savedLanguage() ||
  browserLanguage(
    typeof navigator === "undefined"
      ? ""
      : (navigator.languages || [navigator.language]).join(","),
  );
const listeners = new Set();
export const getLanguage = () => language;
export const getIntlLocale = () => intlLocale(language);
export const subscribeLanguage = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function setCurrentLanguage(value) {
  if (!isLanguage(value) || value === language) return;
  language = value;
  for (const listener of listeners) listener();
}
export const tr = (value, values) => translate(value, language, values);

export function dateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return "";
  const iso = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return (
    formatDate(iso, language) +
    ", " +
    date.toLocaleTimeString(intlLocale(language), {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}
