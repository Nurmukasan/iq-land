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
import {
  eventSchema,
  registrationSchema,
  archiveSchema,
} from "./validation.js";
import {
  maxImageBytes,
  imageTypes,
  imagePath,
  storeEventImage,
} from "./event-images.js";
import { receiveEventVideo, videoPath, videoTypes } from "./event-videos.js";
import { awardsRouter } from "./awards.js";
import { MAX_SCORE } from "../shared/award-rules.js";
import { detectLanguage } from "./language.js";
import { documentFile, storeEventDocument } from "./event-documents.js";
import { DOCUMENT_TYPES, documentExtension, MAX_DOCUMENT_BYTES } from "../shared/event-documents.js";
import { translate, exportLanguage } from "../shared/i18n/index.js";
import { PRIVACY_VERSION, CONSENT_TEXT, PRIVACY_SECTIONS, REGISTRATION_PAUSED_MESSAGE } from "../shared/privacy.js";
import { legalDetails } from "./legal.js";

const app = express();
const production = process.env.NODE_ENV === "production";
const publicLegalDetails = legalDetails();
const registrationsPaused = process.env.IQLAND_REGISTRATION_PAUSED === "true";
// Nginx connects locally and overwrites X-Forwarded-For with the peer's IP.
// Trust only that local hop, never arbitrary public proxy chains.
if (production) app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(
  helmet({
    referrerPolicy: { policy: "no-referrer" },
    contentSecurityPolicy: production
      ? {
          directives: {
            // Upload forms preview local files before the server returns a URL.
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:"],
          },
        }
      : false,
    strictTransportSecurity: production ? undefined : false,
  }),
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
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
const organizer = (req, res, next) =>
  ["admin", "director"].includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: "Доступно организаторам" });
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
app.post("/api/event-videos", auth, admin, async (req, res) => {
  try {
    const url = await receiveEventVideo(req);
    res.status(201).json({ url });
  } catch (error) {
    if (res.destroyed || req.aborted || res.headersSent) return;
    const status = [400, 413, 415].includes(error.status) ? error.status : 500;
    res.status(status).json({
      error:
        status === 500
          ? "Не удалось сохранить видео. Попробуйте ещё раз."
          : error.message,
    });
  }
});
app.get("/api/event-videos/:filename", (req, res, next) => {
  const staff = ["admin", "director"].includes(req.user?.role);
  if (!staff && !db.prepare("SELECT 1 FROM events WHERE video=? AND active=1 AND date<? LIMIT 1")
    .get(`/api/event-videos/${req.params.filename}`, new Date().toISOString().slice(0, 10)))
    return res.status(404).json({ error: "Видео не найдено" });
  const path = videoPath(req.params.filename);
  if (!path) return res.status(404).json({ error: "Видео не найдено" });
  const extension = req.params.filename.split(".").at(-1);
  res.set({
    "Content-Type": Object.entries(videoTypes).find(
      ([, ext]) => ext === extension,
    )[0],
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.sendFile(path, (error) => {
    if (!error) return;
    if (error.status === 416 && !res.headersSent) {
      if (error.headers) res.set(error.headers);
      return res.status(416).end();
    }
    next(error);
  });
});
app.post("/api/event-documents", auth, organizer, (req, res, next) => {
  express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES })(req, res, (error) => {
    if (error?.status === 413) return res.status(413).json({ error: "Файл слишком большой. Максимальный размер — 20 МБ." });
    next(error);
  });
}, (req, res) => {
  try {
    let name;
    try { name = decodeURIComponent(req.get("X-File-Name") || ""); }
    catch { return res.status(400).json({ error: "Проверьте название файла." }); }
    res.status(201).json(storeEventDocument(req.body, name));
  } catch (error) {
    const status = [400, 413, 415].includes(error.status) ? error.status : 500;
    res.status(status).json({ error: status === 500 ? "Не удалось сохранить файл. Попробуйте ещё раз." : error.message });
  }
});
app.get("/api/event-documents/:filename", (req, res, next) => {
  const file = documentFile(req.params.filename);
  if (!file) return res.status(404).json({ error: "Файл не найден." });
  const staff = ["admin", "director"].includes(req.user?.role);
  const doc = db.prepare(`SELECT json_extract(d.value,'$.name') AS name
    FROM events e, json_each(e.documents) d
    WHERE json_extract(d.value,'$.url')=? AND (e.active=1 OR ?) LIMIT 1`)
    .get(`/api/event-documents/${req.params.filename}`, Number(staff));
  if (!doc && !staff) return res.status(404).json({ error: "Файл не найден." });
  const ext = documentExtension(req.params.filename);
  const disposition = ["pdf", "txt"].includes(ext) ? "inline" : "attachment";
  const name = doc?.name || `document.${ext}`;
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set({
    "Content-Type": DOCUMENT_TYPES[ext],
    "Content-Disposition": `${disposition}; filename="document.${ext}"; filename*=UTF-8''${encoded}`,
    "Content-Security-Policy": "sandbox; default-src 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  res.sendFile(file.path, (error) => {
    if (!error) return;
    if (error.status === 416 && !res.headersSent) {
      if (error.headers) res.set(error.headers);
      return res.status(416).end();
    }
    next(error);
  });
});
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", storage: "sqlite" }),
);
app.get("/api/legal", (req, res) => res.json({ ...publicLegalDetails, privacyVersion: PRIVACY_VERSION, registrationOpen: !registrationsPaused }));
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
const todayUtc = () => new Date().toISOString().slice(0, 10);
app.get("/api/language", (req, res) => {
  res.set("Vary", "Accept-Language");
  res.json(detectLanguage(req.ip, req.get("Accept-Language") || ""));
});
app.get("/api/events", (req, res) =>
  res.json(allEvents().filter((e) => e.active && e.date >= todayUtc())),
);
app.get("/api/archive", (req, res) =>
  res.json(
    allEvents()
      .filter((event) => event.active && event.date < todayUtc())
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.city.localeCompare(b.city, "ru"),
      ),
  ),
);
app.get("/api/archive/:id", (req, res) => {
  const event = eventObject(
    db
      .prepare("SELECT * FROM events WHERE id=? AND active=1 AND date<?")
      .get(req.params.id, todayUtc()),
  );
  if (!event)
    return res.status(404).json({ error: "Прошедшая олимпиада не найдена" });
  res.json({
    event,
    resultsPublished: false,
    results: [],
  });
});
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
  organizer,
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
          return res.status(413).json({
            error: "Фотография слишком большая. Максимальный размер — 8 МБ",
          });
        next(error);
      },
    );
  },
  (req, res) => {
    const url = storeEventImage(req.body, req.imageType);
    if (!url)
      return res.status(400).json({
        error: "Файл повреждён или не соответствует формату JPEG, PNG или WebP",
      });
    res.status(201).json({ url });
  },
);
app.get("/api/event-images/:filename", (req, res) => {
  const staff = ["admin", "director"].includes(req.user?.role);
  if (!staff && !db.prepare("SELECT 1 FROM events WHERE image=? AND active=1 LIMIT 1")
    .get(`/api/event-images/${req.params.filename}`))
    return res.status(404).json({ error: "Фотография не найдена" });
  const path = imagePath(req.params.filename);
  if (!path) return res.status(404).json({ error: "Фотография не найдена" });
  const extension = req.params.filename.split(".").at(-1);
  res.set({
    "Content-Type": Object.entries(imageTypes).find(
      ([, ext]) => ext === extension,
    )[0],
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
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
    const requestKey = req.get("Idempotency-Key");
    if (requestKey && !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey))
      return res.status(400).json({ error: "Не удалось проверить отправку. Обновите страницу." });
    // Language/notice updates must not turn a retry of an existing team into
    // a second registration, including requests saved before versioned consent.
    const { privacyVersion, consentLanguage, ...registrationContent } = data;
    const requestHash = digest(JSON.stringify(registrationContent));
    const respondToRetry = (previous) => {
      if (previous.request_hash !== requestHash)
        return res.status(409).json({ error: "Данные заявки изменились. Обновите страницу и проверьте список перед отправкой." });
      return res.status(201).json(JSON.parse(previous.receipt));
    };
    if (requestKey) {
      const previous = db.prepare("SELECT * FROM registration_requests WHERE request_key=?").get(requestKey);
      if (previous) return respondToRetry(previous);
    }
    // Recover an existing legacy receipt above, but never accept a new team
    // without an explicit confirmation of the current notice.
    if (registrationsPaused)
      return res.status(503).json({ error: REGISTRATION_PAUSED_MESSAGE });
    if (!data.privacyVersion)
      return res.status(400).json({ error: "Условия обработки данных обновились. Обновите страницу и подтвердите согласие заново." });
    const e = eventObject(
      db
        .prepare("SELECT * FROM events WHERE id=? AND active=1")
        .get(data.eventId),
      { includePrivate: true },
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
    const receipt = { id, count: data.students.length, telegramUrl: e.telegramUrl, documents: e.documents };
    db.exec("BEGIN IMMEDIATE");
    try {
      if (requestKey) {
        const previous = db.prepare("SELECT * FROM registration_requests WHERE request_key=?").get(requestKey);
        if (previous) { db.exec("COMMIT"); return respondToRetry(previous); }
      }
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
      // Historical applications are deliberately not backfilled with consent.
      const language = data.consentLanguage || "ru";
      const notice = JSON.stringify({
        version: PRIVACY_VERSION,
        organizer: publicLegalDetails,
        sections: PRIVACY_SECTIONS.map((section) => section.map((text) => translate(text, language))),
      });
      db.prepare("INSERT INTO registration_consents VALUES(?,?,?,?,?,?,?)").run(
        id, new Date().toISOString(), data.privacyVersion, language,
        translate(CONSENT_TEXT, language), notice, digest(notice),
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
      if (requestKey) db.prepare("INSERT INTO registration_requests VALUES(?,?,?,?)").run(requestKey, requestHash, id, JSON.stringify(receipt));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    res
      .status(201)
      .json(receipt);
  },
);
app.get("/api/manage", auth, (req, res) => {
  const registrations = db
    .prepare(
      "SELECT r.*, c.accepted_at AS consent_at, c.policy_version AS privacy_version, (SELECT COUNT(*) FROM students s WHERE s.registration_id=r.id) AS student_count FROM registrations r LEFT JOIN registration_consents c ON c.registration_id=r.id ORDER BY r.created DESC",
    )
    .all()
    .map((r) => ({ ...r, teachers: JSON.parse(r.teachers) }));
  res.json({
    events: allEvents({ includePrivate: true }),
    registrations,
    entries: protocolRows(),
  });
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
      score > MAX_SCORE)
  )
    return res
      .status(400)
      .json({ error: "Баллы должны быть от 0 до 1 000 000" });
  const r = db
    .prepare("UPDATE entries SET score=? WHERE id=?")
    .run(score, req.params.id);
  return r.changes
    ? res.json({ ok: true })
    : res.status(404).json({ error: "Участник не найден" });
});
app.use("/api/awards", auth, organizer, awardsRouter);
app.post("/api/events", auth, organizer, (req, res) => {
  const e = parse(eventSchema, req.body, res);
  if (!e) return;
  const id = randomUUID();
  db.prepare(
    "INSERT INTO events(id,title,city,country,flag,date,deadline,subjects,includes,price,currency,image,description,active,telegram_url,documents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
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
    e.telegramUrl ?? "",
    JSON.stringify(e.documents || []),
  );
  res.status(201).json({ id });
});
app.put("/api/events/:id/archive", auth, admin, (req, res) => {
  const data = parse(archiveSchema, req.body, res);
  if (!data) return;
  const updated = db
    .prepare("UPDATE events SET video=?,results_published=? WHERE id=?")
    .run(data.video, 0, req.params.id);
  return updated.changes
    ? res.json({ ok: true })
    : res.status(404).json({ error: "Мероприятие не найдено" });
});
app.put("/api/events/:id", auth, organizer, (req, res) => {
  const e = parse(eventSchema, req.body, res);
  if (!e) return;
  const previous = eventObject(
    db.prepare("SELECT * FROM events WHERE id=?").get(req.params.id),
    { includePrivate: true },
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
    "UPDATE events SET title=?,city=?,country=?,flag=?,date=?,deadline=?,subjects=?,includes=?,price=?,currency=?,image=?,description=?,active=?,telegram_url=?,documents=? WHERE id=?",
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
    e.telegramUrl ?? previous.telegramUrl,
    JSON.stringify(e.documents ?? previous.documents),
    req.params.id,
  );
  res.json({ ok: true });
});
app.get("/api/export", auth, async (req, res, next) => {
  const language = exportLanguage(req.get("Accept-Language"));
  const t = (value) => translate(value, language);
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
      const sheet = book.addWorksheet(t(name), {
        views: [{ state: "frozen", ySplit: 1 }],
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        },
      });
      sheet.columns = headers.map(([header, key, width]) => ({
        header: t(header),
        key,
        width: width || 25,
      }));
      sheet.addRows(
        items.map((r) => ({
          ...r,
          ...(r.subject ? { subject: t(r.subject) } : {}),
          ...(r.type ? { type: t(r.type) } : {}),
          ...(r.status ? { status: t(statusLabel[r.status]) } : {}),
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
        ["Рейтинг", "place", 12],
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
app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || (production ? "127.0.0.1" : "0.0.0.0"),
  () => console.log(`IQ LAND API running on port ${process.env.PORT || 3001}`),
);
