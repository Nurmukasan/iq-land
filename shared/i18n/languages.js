export const LANGUAGES = [
  { code: "kk", name: "Қазақша", intl: "kk-KZ" },
  { code: "ru", name: "Русский", intl: "ru-RU" },
  { code: "en", name: "English", intl: "en-GB" },
  { code: "az", name: "Azərbaycanca", intl: "az-AZ" },
  { code: "uz", name: "Oʻzbekcha", intl: "uz-UZ" },
];
export const isLanguage = (value) => LANGUAGES.some((l) => l.code === value);
export const intlLocale = (code) =>
  LANGUAGES.find((l) => l.code === code)?.intl || "en-GB";
// Export API keeps its original Russian default for clients with no preference.
export const exportLanguage = (value = "") =>
  /(?:^|,)\s*(?:en|ru|kk|az|uz)(?:[-_;,]|$)/i.test(value)
    ? browserLanguage(value)
    : "ru";
export function browserLanguage(value = "") {
  const preferences = String(value)
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().split(";");
      const quality = params.find((p) => p.trim().startsWith("q="));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        code: tag.toLowerCase().split(/[-_]/)[0],
        q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0,
        index,
      };
    })
    .filter((p) => p.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return preferences.find((p) => isLanguage(p.code))?.code || "en";
}
export function languageForCountry(country, preferred = "") {
  switch (String(country || "").toUpperCase()) {
    case "KZ":
      return "kk";
    case "UZ":
      return "uz";
    case "AZ":
      return "az";
    case "RU":
      return "ru";
    case "":
      return browserLanguage(preferred);
    default:
      return "en";
  }
}
