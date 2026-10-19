// Explicit month names keep Kazakh dates readable in browsers with reduced ICU
// data (which can otherwise render the month as “M10”).
const months = {
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  kk: [
    "қаңтар",
    "ақпан",
    "наурыз",
    "сәуір",
    "мамыр",
    "маусым",
    "шілде",
    "тамыз",
    "қыркүйек",
    "қазан",
    "қараша",
    "желтоқсан",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  az: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avqust",
    "sentyabr",
    "oktyabr",
    "noyabr",
    "dekabr",
  ],
  uz: [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ],
};
export function formatDate(value, language = "en") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value || "";
  const [year, month, day] = value.split("-").map(Number);
  const name = (months[language] || months.en)[month - 1];
  if (!name) return value;
  if (language === "uz") return `${year}-yil ${day}-${name}`;
  return `${day} ${name} ${year}${language === "kk" ? " ж." : language === "ru" ? " г." : ""}`;
}
