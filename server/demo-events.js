// Optional fixtures for local demos and isolated tests, never production defaults.
export const demoEvents = [
  {
    id: "baku-2027",
    title: "Baku International Olympiad",
    city: "Баку",
    country: "Азербайджан",
    flag: "🇦🇿",
    date: "2027-10-03",
    deadline: "2027-09-20",
    subjects: ["Английский язык", "Математика"],
    includes: [
      "Участие в олимпиаде",
      "Посещение цирка",
      "Сертификат участника",
    ],
    price: null,
    currency: "KZT",
    image: "",
    description:
      "Новые знания, новые друзья и город, в который хочется вернуться. Объедините интеллектуальное соревнование с открытием удивительного Баку.",
    active: true,
  },
  {
    id: "almaty-2027",
    title: "Almaty Mental Arithmetic",
    city: "Алматы",
    country: "Казахстан",
    flag: "🇰🇿",
    date: "2027-11-14",
    deadline: "2027-11-01",
    subjects: ["Ментальная арифметика"],
    includes: [
      "Участие в олимпиаде",
      "Посещение КБТУ и ЖЕНПУ",
      "Сертификат участника",
    ],
    price: null,
    currency: "KZT",
    image: "",
    description:
      "Ментальная арифметика у подножия гор. Познакомьтесь с университетами Алматы и подарите детям вдохновение для будущих открытий.",
    active: true,
  },
];

const migrationKey = "migration:remove-seeded-events:v1";
const legacyImages = ["/images/baku.png", "/images/almaty.png"];

function isOriginalDemo(row, seed) {
  if (!row || row.active !== 1 || row.video || row.results_published)
    return false;
  const legacyImage = `/images/${seed.id.split("-")[0]}.png`;
  if (!["", legacyImage].includes(row.image)) return false;
  for (const [field, value] of Object.entries(seed)) {
    if (field === "active" || field === "image") continue;
    if (Array.isArray(value)) {
      try {
        if (JSON.stringify(JSON.parse(row[field])) !== JSON.stringify(value))
          return false;
      } catch {
        return false;
      }
    } else if (row[field] !== value) return false;
  }
  return true;
}

export function prepareEvents(db, seedDemo = false) {
  db.exec("BEGIN");
  try {
    if (
      !seedDemo &&
      !db.prepare("SELECT value FROM settings WHERE key=?").get(migrationKey)
    ) {
      for (const seed of demoEvents) {
        const row = db.prepare("SELECT * FROM events WHERE id=?").get(seed.id);
        if (isOriginalDemo(row, seed))
          db.prepare("UPDATE events SET active=0 WHERE id=?").run(seed.id);
      }
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(
        migrationKey,
        "1",
      );
    }
    db.prepare("UPDATE events SET image='' WHERE image IN (?,?)").run(
      ...legacyImages,
    );
    if (seedDemo && !db.prepare("SELECT id FROM events LIMIT 1").get()) {
      const insert = db.prepare(
        "INSERT INTO events(id,title,city,country,flag,date,deadline,subjects,includes,price,currency,image,description) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
      for (const event of demoEvents)
        insert.run(
          event.id,
          event.title,
          event.city,
          event.country,
          event.flag,
          event.date,
          event.deadline,
          JSON.stringify(event.subjects),
          JSON.stringify(event.includes),
          event.price,
          event.currency,
          event.image,
          event.description,
        );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
