import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prepareEvents } from "./demo-events.js";

export const dataDir = resolve(process.env.DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(dataDir, "iqland.sqlite"));
db.exec(`
 PRAGMA journal_mode = WAL;
 PRAGMA foreign_keys = ON;
 CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT NOT NULL, city TEXT NOT NULL, country TEXT NOT NULL, flag TEXT NOT NULL, date TEXT NOT NULL, deadline TEXT NOT NULL, subjects TEXT NOT NULL, includes TEXT NOT NULL, price INTEGER, currency TEXT NOT NULL, image TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, event_id TEXT REFERENCES events(id), center TEXT NOT NULL, city TEXT NOT NULL, teacher TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, teachers TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, registration_id TEXT REFERENCES registrations(id) ON DELETE CASCADE, name TEXT NOT NULL, birth TEXT NOT NULL, grade INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, student_id TEXT REFERENCES students(id) ON DELETE CASCADE, subject TEXT NOT NULL, score REAL);
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
db.prepare("INSERT OR IGNORE INTO settings VALUES(?,?)").run(
  "promo",
  JSON.stringify({
    eyebrow: "ДЛЯ ТЕХ, КТО МЕЧТАЕТ О БОЛЬШЕМ",
    title: "Следующее большое открытие —",
    subtitle: "вашей команды.",
    button: "Найти свою олимпиаду",
    href: "#events",
    active: true,
  }),
);

if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
  const accounts = [
    {
      email: "admin@iqland.kz",
      name: "Администратор",
      role: "admin",
      password:
        process.env.IQLAND_ADMIN_PASSWORD ||
        randomBytes(15).toString("base64url"),
    },
    {
      email: "director@iqland.kz",
      name: "Руководитель",
      role: "director",
      password:
        process.env.IQLAND_DIRECTOR_PASSWORD ||
        randomBytes(15).toString("base64url"),
    },
  ];
  for (const u of accounts)
    db.prepare(
      "INSERT INTO users(email,password,name,role) VALUES(?,?,?,?)",
    ).run(u.email, bcrypt.hashSync(u.password, 12), u.name, u.role);
  const credentialsPath = resolve(dataDir, "initial-accounts.json");
  if (!existsSync(credentialsPath)) {
    writeFileSync(credentialsPath, JSON.stringify(accounts, null, 2), {
      mode: 0o600,
    });
    chmodSync(credentialsPath, 0o600);
  }
  console.log(
    "Initial account credentials saved in .data/initial-accounts.json (not tracked by Git).",
  );
}

prepareEvents(db, process.env.IQLAND_SEED_DEMO_EVENTS === "true");

export function eventObject(e) {
  return e
    ? {
        ...e,
        subjects: JSON.parse(e.subjects),
        includes: JSON.parse(e.includes),
        active: Boolean(e.active),
      }
    : null;
}
export function allEvents() {
  return db
    .prepare("SELECT * FROM events ORDER BY date")
    .all()
    .map(eventObject);
}
export function protocolRows() {
  return db
    .prepare(
      `SELECT en.id, s.id AS student_id, s.name, s.birth, s.grade, en.subject, en.score, r.id AS registration_id, r.event_id, r.center, r.city, r.teacher, r.email, r.phone, r.status, r.created, e.city AS event_city, e.date AS event_date FROM entries en JOIN students s ON s.id=en.student_id JOIN registrations r ON r.id=s.registration_id JOIN events e ON e.id=r.event_id`,
    )
    .all()
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        a.subject.localeCompare(b.subject, "ru") ||
        a.grade - b.grade ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.name.localeCompare(b.name, "ru"),
    );
}
