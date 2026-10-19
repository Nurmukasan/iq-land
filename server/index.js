import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db, allEvents, eventObject, protocolRows } from "./db.js";
import { eventSchema, registrationSchema } from "./validation.js";
import {
  maxImageBytes,
  imageTypes,
  imagePath,
  storeEventImage,
} from "./event-images.js";

const app = express();
const production = process.env.NODE_ENV === "production";
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: production ? undefined : false,
    strictTransportSecurity: production ? undefined : false,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res
          .status(403)
          .json({ error: "Запрос с другого сайта отклонён" });
    } catch {
      return res.status(403).json({ error: "Некорректный источник запроса" });
    }
  }
  next();
});
const digest = (v) => createHash("sha256").update(v).digest("hex");
app.use((req, res, next) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("iq_session="))
    ?.slice(11);
  if (token) {
    req.sessionHash = digest(token);
    req.user = db
      .prepare(
        "SELECT u.id,u.email,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
      )
      .get(req.sessionHash, Date.now());
  }
  next();
});
const auth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "Войдите в кабинет" });
const admin = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res.status(403).json({ error: "Доступно администратору" });
const parse = (schema, body, res) => {
  const r = schema.safeParse(body);
  if (!r.success) {
    res.status(400).json({
      error: r.error.issues[0].message,
      fields: r.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return null;
  }
  return r.data;
};
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", storage: "sqlite" }),
);
app.get("/api/promo", (req, res) =>
  res.json(
    JSON.parse(
      db.prepare("SELECT value FROM settings WHERE key=?").get("promo").value,
    ),
  ),
);
app.put("/api/promo", auth, admin, (req, res) => {
  const schema = z.object({
    eyebrow: z.string().trim().min(2).max(160),
    title: z.string().trim().min(2).max(160),
    subtitle: z.string().trim().min(2).max(160),
    button: z.string().trim().min(2).max(160),
    href: z
      .string()
      .max(300)
      .refine((v) => {
        if (v === "#events") return true;
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "Используйте https://… или #events"),
    active: z.boolean(),
  });
  const data = parse(schema, req.body, res);
  if (!data) return;
  db.prepare("UPDATE settings SET value=? WHERE key=?").run(
    JSON.stringify(data),
    "promo",
  );
  res.json({ ok: true });
});
app.get("/api/events", (req, res) =>
  res.json(allEvents().filter((e) => e.active)),
);
app.get("/api/events/:id", (req, res) => {
  const e = eventObject(
    db
      .prepare("SELECT * FROM events WHERE id=? AND active=1")
      .get(req.params.id),
  );
  return e
    ? res.json(e)
    : res.status(404).json({ error: "Мероприятие не найдено" });
});
app.post(
  "/api/event-images",
  auth,
  admin,
  (req, res, next) => {
    const type = req.headers["content-type"]
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (!Object.hasOwn(imageTypes, type || ""))
      return res
        .status(415)
        .json({ error: "Выберите фотографию в формате JPEG, PNG или WebP" });
    req.imageType = type;
    express.raw({ type: () => true, limit: maxImageBytes })(
      req,
      res,
      (error) => {
        if (error?.status === 413)
          return res
            .status(413)
            .json({
              error: "Фотография слишком большая. Максимальный размер — 8 МБ",
            });
        next(error);
      },
    );
  },
  (req, res) => {
    const url = storeEventImage(req.body, req.imageType);
    if (!url)
      return res
        .status(400)
        .json({
          error:
            "Файл повреждён или не соответствует формату JPEG, PNG или WebP",
        });
    res.status(201).json({ url });
  },
);
app.get("/api/event-images/:filename", (req, res) => {
  const path = imagePath(req.params.filename);
  if (!path) return res.status(404).json({ error: "Фотография не найдена" });
  const extension = req.params.filename.split(".").at(-1);
  res.set({
    "Content-Type": Object.entries(imageTypes).find(
      ([, ext]) => ext === extension,
    )[0],
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  res.sendFile(path);
});
app.get("/api/auth/me", (req, res) => res.json({ user: req.user || null }));
app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Слишком много попыток. Попробуйте через 15 минут." },
  }),
  async (req, res) => {
    const { email, password } = req.body || {};
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length > 200
    )
      return res.status(400).json({ error: "Укажите email и пароль" });
    const u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.trim().toLowerCase());
    const valid = await bcrypt.compare(
      password,
      u?.password ||
        "$2b$12$XPLKnEzLfxJJoOj3EoVeu.8ydKNKzrMkequqHS/PjA1pA7/OvuLs6",
    );
    if (!u || !valid)
      return res.status(401).json({ error: "Неверный email или пароль" });
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      digest(token),
      u.id,
      Date.now() + 12 * 60 * 60 * 1000,
    );
    res.cookie("iq_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 12 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
    });
  },
);
app.post("/api/auth/logout", (req, res) => {
  if (req.sessionHash)
    db.prepare("DELETE FROM sessions WHERE token=?").run(req.sessionHash);
  res.clearCookie("iq_session", { path: "/" }).json({ ok: true });
});
app.post(
  "/api/registrations",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Достигнут лимит заявок. Повторите позже." },
  }),
  (req, res) => {
    const data = parse(registrationSchema, req.body, res);
    if (!data) return;
    const e = eventObject(
      db
        .prepare("SELECT * FROM events WHERE id=? AND active=1")
        .get(data.eventId),
    );
    if (!e) return res.status(404).json({ error: "Мероприятие не найдено" });
    if (e.deadline < new Date().toISOString().slice(0, 10))
      return res
        .status(400)
        .json({ error: "Регистрация на это мероприятие завершена" });
    if (
      data.students.some((s) => s.subjects.some((v) => !e.subjects.includes(v)))
    )
      return res
        .status(400)
        .json({ error: "Выбрана дисциплина, которой нет на этой олимпиаде" });
    const id = "IQ-" + randomBytes(5).toString("hex").toUpperCase();
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO registrations(id,event_id,center,city,teacher,email,phone,teachers,note,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        data.eventId,
        data.center,
        data.city,
        data.teacher,
        data.email,
        data.phone,
        JSON.stringify(data.teachers),
        data.note,
        new Date().toISOString(),
      );
      for (const s of data.students) {
        const sid = randomUUID();
        db.prepare("INSERT INTO students VALUES(?,?,?,?,?)").run(
          sid,
          id,
          s.name,
          s.birth,
          s.grade,
        );
        for (const subject of new Set(s.subjects))
          db.prepare("INSERT INTO entries VALUES(?,?,?,NULL)").run(
            randomUUID(),
            sid,
            subject,
          );
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    res.status(201).json({ id, count: data.students.length });
  },
);
app.get("/api/manage", auth, (req, res) => {
  const registrations = db
    .prepare(
      "SELECT r.*, (SELECT COUNT(*) FROM students s WHERE s.registration_id=r.id) AS student_count FROM registrations r ORDER BY r.created DESC",
    )
    .all()
    .map((r) => ({ ...r, teachers: JSON.parse(r.teachers) }));
  res.json({ events: allEvents(), registrations, entries: protocolRows() });
});
app.patch("/api/registrations/:id/status", auth, (req, res) => {
  if (!["new", "confirmed", "cancelled"].includes(req.body.status))
    return res.status(400).json({ error: "Неизвестный статус" });
  const r = db
    .prepare("UPDATE registrations SET status=? WHERE id=?")
    .run(req.body.status, req.params.id);
  return r.changes
    ? res.json({ ok: true })
    : res.status(404).json({ error: "Заявка не найдена" });
});
app.patch("/api/entries/:id", auth, (req, res) => {
  const score = req.body.score;
  if (
    score !== null &&
    (typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100)
  )
    return res.status(400).json({ error: "Баллы должны быть от 0 до 100" });
  const r = db
    .prepare("UPDATE entries SET score=? WHERE id=?")
    .run(score, req.params.id);
  return r.changes
    ? res.json({ ok: true })
    : res.status(404).json({ error: "Участник не найден" });
});
app.post("/api/events", auth, admin, (req, res) => {
  const e = parse(eventSchema, req.body, res);
  if (!e) return;
  const id = randomUUID();
  db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
    id,
    e.title,
    e.city,
    e.country,
    e.flag,
    e.date,
    e.deadline,
    JSON.stringify(e.subjects),
    JSON.stringify(e.includes),
    e.price,
    e.currency,
    e.image,
    e.description,
    Number(e.active),
  );
  res.status(201).json({ id });
});
app.put("/api/events/:id", auth, admin, (req, res) => {
  const e = parse(eventSchema, req.body, res);
  if (!e) return;
  const previous = eventObject(
    db.prepare("SELECT * FROM events WHERE id=?").get(req.params.id),
  );
  if (!previous)
    return res.status(404).json({ error: "Мероприятие не найдено" });
  const used = db
    .prepare(
      "SELECT DISTINCT en.subject FROM entries en JOIN students s ON s.id=en.student_id JOIN registrations r ON r.id=s.registration_id WHERE r.event_id=?",
    )
    .all(req.params.id)
    .map((r) => r.subject);
  if (used.some((s) => !e.subjects.includes(s)))
    return res.status(400).json({
      error: "Нельзя удалить дисциплину с зарегистрированными учениками",
    });
  db.prepare(
    "UPDATE events SET title=?,city=?,country=?,flag=?,date=?,deadline=?,subjects=?,includes=?,price=?,currency=?,image=?,description=?,active=? WHERE id=?",
  ).run(
    e.title,
    e.city,
    e.country,
    e.flag,
    e.date,
    e.deadline,
    JSON.stringify(e.subjects),
    JSON.stringify(e.includes),
    e.price,
    e.currency,
    e.image,
    e.description,
    Number(e.active),
    req.params.id,
  );
  res.json({ ok: true });
});
app.get("/api/export", auth, async (req, res, next) => {
  try {
    let rows = protocolRows();
    if (req.query.event)
      rows = rows.filter((r) => r.event_id === req.query.event);
    const book = new ExcelJS.Workbook();
    book.creator = "IQ LAND";
    book.created = new Date();
    const statusLabel = {
      new: "Новая",
      confirmed: "Подтверждена",
      cancelled: "Отменена",
    };
    const addSheet = (name, headers, items) => {
      const sheet = book.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
      });
      sheet.columns = headers.map(([header, key, width]) => ({
        header,
        key,
        width: width || 25,
      }));
      sheet.addRows(
        items.map((r) => ({
          ...r,
          ...(r.status ? { status: statusLabel[r.status] } : {}),
        })),
      );
      sheet.eachRow((row, i) => {
        row.height = i === 1 ? 30 : 25;
        row.font = {
          name: "Calibri",
          size: 11,
          ...(i === 1
            ? { bold: true, color: { argb: "FFFFFFFF" } }
            : { color: { argb: "FF314B42" } }),
        };
        row.alignment = { vertical: "middle", wrapText: true };
        if (i === 1 || i % 2 === 0)
          row.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: i === 1 ? "FF213D3B" : "FFF2F5EC" },
          };
      });
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };
      return sheet;
    };
    const participantRows = Object.values(
      rows.reduce((acc, r) => {
        if (!acc[r.student_id])
          acc[r.student_id] = { ...r, subject: r.subject };
        else acc[r.student_id].subject += ", " + r.subject;
        return acc;
      }, {}),
    ).sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        a.center.localeCompare(b.center, "ru") ||
        a.name.localeCompare(b.name, "ru"),
    );
    addSheet(
      "Участники",
      [
        ["Заявка", "registration_id"],
        ["Мероприятие", "event_city"],
        ["Дата", "event_date"],
        ["ФИО ученика", "name", 35],
        ["Дата рождения", "birth"],
        ["Класс", "grade", 10],
        ["Дисциплины", "subject", 38],
        ["Центр", "center", 30],
        ["Город центра", "city"],
        ["Учитель", "teacher", 30],
        ["Email", "email", 30],
        ["Телефон", "phone"],
        ["Статус", "status"],
      ],
      participantRows,
    );
    const confirmed = rows
      .filter((r) => r.status !== "cancelled")
      .map((r) => ({
        ...r,
        place:
          r.score === null
            ? ""
            : 1 +
              rows.filter(
                (v) =>
                  v.status !== "cancelled" &&
                  v.event_id === r.event_id &&
                  v.subject === r.subject &&
                  v.grade === r.grade &&
                  v.score !== null &&
                  v.score > r.score,
              ).length,
      }));
    addSheet(
      "Протокол",
      [
        ["Мероприятие", "event_city"],
        ["Дисциплина", "subject", 28],
        ["Класс", "grade", 10],
        ["ФИО", "name", 35],
        ["Центр", "center", 30],
        ["Баллы", "score", 12],
        ["Место", "place", 12],
      ],
      confirmed,
    );
    let regs = db
      .prepare("SELECT * FROM registrations ORDER BY created DESC")
      .all();
    if (req.query.event)
      regs = regs.filter((r) => r.event_id === req.query.event);
    const teachers = regs.flatMap((r) =>
      [r.teacher, ...JSON.parse(r.teachers)].map((name, i) => ({
        name,
        center: r.center,
        city: r.city,
        email: r.email,
        phone: r.phone,
        type: i ? "Благодарность" : "Руководитель команды",
        registration: r.id,
        status: r.status,
      })),
    );
    addSheet(
      "Учителя",
      [
        ["ФИО", "name", 35],
        ["Центр", "center", 30],
        ["Город", "city"],
        ["Email контакта", "email", 30],
        ["Телефон контакта", "phone"],
        ["Сертификат", "type"],
        ["Заявка", "registration"],
        ["Статус", "status"],
      ],
      teachers,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="IQ-LAND.xlsx"');
    await book.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Маршрут не найден" }),
);
const dist = resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) => res.sendFile(resolve(dist, "index.html")));
}
app.use((err, req, res, next) => {
  console.error(err.message);
  if (!res.headersSent)
    res.status(err.status === 400 ? 400 : 500).json({
      error:
        err.status === 400
          ? "Некорректный запрос"
          : "Не удалось выполнить запрос. Попробуйте ещё раз.",
    });
});
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log(`IQ LAND API running on port ${process.env.PORT || 3001}`),
);
