export const AWARD_SUBJECTS = [
  "Ментальная арифметика",
  "Английский язык",
  "Математика",
];
export const MEDALS = { gold: "Золото", silver: "Серебро", bronze: "Бронза" };
export const MEDAL_ORDER = { gold: 0, silver: 1, bronze: 2 };
export const MAX_SCORE = 1_000_000;

export function ageOn(birth, date) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(birth || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date || "")
  )
    return null;
  const b = new Date(birth + "T12:00:00Z"),
    d = new Date(date + "T12:00:00Z");
  if (
    Number.isNaN(+b) ||
    Number.isNaN(+d) ||
    b.toISOString().slice(0, 10) !== birth ||
    d.toISOString().slice(0, 10) !== date ||
    birth > date
  )
    return null;
  return (
    Number(date.slice(0, 4)) -
    Number(birth.slice(0, 4)) -
    Number(date.slice(5) < birth.slice(5))
  );
}
export function categoryLabel(category) {
  if (category.minAge !== category.maxAge)
    return `${category.minAge}–${category.maxAge} лет`;
  const n = category.minAge,
    mod = n % 100;
  const word =
    mod >= 11 && mod <= 14
      ? "лет"
      : n % 10 === 1
        ? "год"
        : n % 10 >= 2 && n % 10 <= 4
          ? "года"
          : "лет";
  return `${n} ${word}`;
}
export function normalizeCategories(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw Error("Добавьте хотя бы одну возрастную категорию.");
  const categories = value
    .map((value) => {
      const { minAge, maxAge } = value || {};
      if (
        !Number.isInteger(minAge) ||
        !Number.isInteger(maxAge) ||
        minAge < 0 ||
        maxAge > 99 ||
        minAge > maxAge
      )
        throw Error(
          "Возраст: целые числа от 0 до 99, нижняя граница не больше верхней.",
        );
      return { id: `${minAge}-${maxAge}`, minAge, maxAge };
    })
    .sort((a, b) => a.minAge - b.minAge);
  if (categories.some((c, i) => i > 0 && c.minAge <= categories[i - 1].maxAge))
    throw Error(
      "Возрастные категории пересекаются. Каждый возраст должен входить только в одну категорию.",
    );
  return categories;
}
export function assignMedals(rows, categories) {
  const normalized = normalizeCategories(categories);
  if (!rows.length) throw Error("В этой олимпиаде пока нет участников.");
  const groups = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > MAX_SCORE)
      throw Error(
        "Сначала заполните баллы всех участников по всем предметам. Ноль тоже считается результатом.",
      );
    const category = normalized.find(
      (c) => row.age !== null && row.age >= c.minAge && row.age <= c.maxAge,
    );
    if (!category)
      throw Error(
        "Для некоторых участников не задана возрастная категория. Проверьте диапазоны возраста.",
      );
    const key = row.subject + ":" + category.id;
    if (!groups.has(key)) groups.set(key, []);
    groups
      .get(key)
      .push({
        ...row,
        categoryId: category.id,
        categoryLabel: categoryLabel(category),
        categoryMinAge: category.minAge,
      });
  }
  return [...groups.values()].flatMap((group) => {
    group.sort(
      (a, b) =>
        b.score - a.score ||
        a.name.localeCompare(b.name, "ru") ||
        a.id.localeCompare(b.id),
    );
    const goldEnd = Math.ceil(group.length * 0.3),
      silverEnd = Math.ceil(group.length * 0.6);
    let rank = 1;
    return group.map((row, i) => {
      if (i && row.score !== group[i - 1].score) rank = i + 1;
      return {
        ...row,
        rank,
        medal:
          rank <= goldEnd ? "gold" : rank <= silverEnd ? "silver" : "bronze",
      };
    });
  });
}
export function compareAwardRows(a, b) {
  return (
    MEDAL_ORDER[a.medal] - MEDAL_ORDER[b.medal] ||
    AWARD_SUBJECTS.indexOf(a.subject) - AWARD_SUBJECTS.indexOf(b.subject) ||
    a.categoryMinAge - b.categoryMinAge ||
    b.score - a.score ||
    a.name.localeCompare(b.name, "ru") ||
    a.id.localeCompare(b.id)
  );
}
