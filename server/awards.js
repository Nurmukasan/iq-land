import express from "express";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db, allEvents, eventObject } from "./db.js";
import {
  ageOn,
  categoryLabel,
  normalizeCategories,
  assignMedals,
  compareAwardRows,
  MEDALS,
  MAX_SCORE,
  DEFAULT_CATEGORIES,
} from "../shared/award-rules.js";

export const awardsRouter = express.Router();
const today = () => new Date().toISOString().slice(0, 10);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (s) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
const centerId = (center, city) =>
  hash(JSON.stringify([normalize(center), normalize(city)])).slice(0, 24);
const fail = (message, status = 400) =>
  Object.assign(Error(message), { status });
const safely = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.status) res.status(error.status).json({ error: error.message });
    else next(error);
  }
};
function readEvent(id) {
  const event = db.prepare("SELECT * FROM events WHERE id=?").get(id);
  if (!event) throw fail("Олимпиада не найдена", 404);
  if (event.date > today())
    throw fail("Баллы можно вносить начиная с даты олимпиады.", 409);
  return event;
}
function snapshot(id) {
  const raw = readEvent(id);
  const savedCategories = JSON.parse(raw.award_categories || "[]");
  const categories = savedCategories.length
    ? savedCategories
    : DEFAULT_CATEGORIES;
  const rows = db
    .prepare(
      `SELECT en.id,s.id AS studentId,s.name,s.birth,s.grade,en.subject,en.score,r.center,r.city
    FROM entries en JOIN students s ON s.id=en.student_id JOIN registrations r ON r.id=s.registration_id
    WHERE r.event_id=? AND r.status!='cancelled' ORDER BY en.id`,
    )
    .all(id)
    .map((row) => {
      const age = ageOn(row.birth, raw.date);
      const category = categories.find(
        (c) => age !== null && age >= c.minAge && age <= c.maxAge,
      );
      return {
        ...row,
        age,
        centerId: centerId(row.center, row.city),
        categoryId: category?.id || null,
        categoryLabel: category ? categoryLabel(category) : "Без категории",
      };
    });
  const inputHash = hash(
    JSON.stringify({
      event: [raw.id, raw.title, raw.date, raw.city, raw.country],
      categories,
      rows,
    }),
  );
  return { event: eventObject(raw), categories, rows, inputHash };
}
function resultFor(state) {
  const run = db
    .prepare("SELECT * FROM award_runs WHERE event_id=?")
    .get(state.event.id);
  if (!run) return null;
  const results = JSON.parse(run.results);
  const centers = new Map();
  for (const row of results) {
    if (!centers.has(row.centerId))
      centers.set(row.centerId, {
        id: row.centerId,
        name: row.center,
        city: row.city,
        participants: new Set(),
        entries: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
      });
    const center = centers.get(row.centerId);
    center.participants.add(row.studentId);
    center.entries++;
    center[row.medal]++;
  }
  return {
    generatedAt: run.generated_at,
    stale: run.input_hash !== state.inputHash,
    counts: results.reduce((a, r) => ({ ...a, [r.medal]: a[r.medal] + 1 }), {
      gold: 0,
      silver: 0,
      bronze: 0,
    }),
    centers: [...centers.values()]
      .map((c) => ({ ...c, participants: c.participants.size }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "ru") ||
          a.city.localeCompare(b.city, "ru"),
      ),
  };
}
function stateFor(id) {
  const state = snapshot(id);
  state.rows.sort(
    (a, b) =>
      (a.age ?? 999) - (b.age ?? 999) ||
      normalize(a.center).localeCompare(normalize(b.center), "ru") ||
      normalize(a.city).localeCompare(normalize(b.city), "ru") ||
      a.name.localeCompare(b.name, "ru") ||
      a.id.localeCompare(b.id),
  );
  return {
    ...state,
    summary: {
      participants: new Set(state.rows.map((r) => r.studentId)).size,
      entries: state.rows.length,
      missingScores: state.rows.filter((r) => r.score === null).length,
      uncategorized: state.rows.filter((r) => !r.categoryId).length,
    },
    result: resultFor(state),
  };
}
awardsRouter.get(
  "/",
  safely((req, res) => {
    res.json(
      allEvents()
        .filter((e) => e.date <= today())
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            a.title.localeCompare(b.title, "ru"),
        ),
    );
  }),
);
awardsRouter.get(
  "/:id",
  safely((req, res) => res.json(stateFor(req.params.id))),
);
awardsRouter.put(
  "/:id/categories",
  safely((req, res) => {
    readEvent(req.params.id);
    let categories;
    try {
      categories = normalizeCategories(req.body?.categories);
    } catch (error) {
      throw fail(error.message);
    }
    db.prepare("UPDATE events SET award_categories=? WHERE id=?").run(
      JSON.stringify(categories),
      req.params.id,
    );
    res.json(stateFor(req.params.id));
  }),
);
const scoresSchema = z
  .object({
    scores: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          score: z.number().min(0).max(MAX_SCORE).nullable(),
          previous: z.number().nullable().optional(),
        }),
      )
      .min(1)
      .max(10000),
  })
  .strict();
awardsRouter.put(
  "/:id/scores",
  safely((req, res) => {
    const parsed = scoresSchema.safeParse(req.body);
    if (!parsed.success)
      throw fail("Проверьте баллы: число от 0 до 1 000 000 или пустое поле.");
    const scores = parsed.data.scores;
    if (new Set(scores.map((r) => r.id)).size !== scores.length)
      throw fail("Участник повторяется в запросе.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = snapshot(req.params.id),
        entries = new Map(state.rows.map((r) => [r.id, r]));
      for (const item of scores) {
        const current = entries.get(item.id);
        if (!current)
          throw fail(
            "Участник не найден в активном списке этой олимпиады.",
            409,
          );
        if (item.previous !== undefined && item.previous !== current.score)
          throw fail(
            "Баллы уже изменены другим организатором. Обновите список перед сохранением.",
            409,
          );
      }
      const update = db.prepare("UPDATE entries SET score=? WHERE id=?");
      for (const item of scores) update.run(item.score, item.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.json(stateFor(req.params.id));
  }),
);
awardsRouter.post(
  "/:id/generate",
  safely((req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.body?.expectedHash || ""))
      throw fail("Обновите список перед расчётом результатов.");
    db.exec("BEGIN IMMEDIATE");
    try {
      const state = snapshot(req.params.id);
      if (req.body.expectedHash !== state.inputHash)
        throw fail(
          "Список или баллы изменились. Обновите страницу и повторите расчёт.",
          409,
        );
      let results;
      try {
        results = assignMedals(state.rows, state.categories);
      } catch (error) {
        throw fail(error.message);
      }
      db.prepare(
        `INSERT INTO award_runs(event_id,input_hash,generated_at,generated_by,results) VALUES(?,?,?,?,?)
      ON CONFLICT(event_id) DO UPDATE SET input_hash=excluded.input_hash,generated_at=excluded.generated_at,generated_by=excluded.generated_by,results=excluded.results`,
      ).run(
        req.params.id,
        state.inputHash,
        new Date().toISOString(),
        req.user.id,
        JSON.stringify(results),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    res.json(stateFor(req.params.id));
  }),
);
awardsRouter.get(
  "/:id/centers/:center/export",
  safely(async (req, res) => {
    const state = snapshot(req.params.id);
    const run = db
      .prepare("SELECT * FROM award_runs WHERE event_id=?")
      .get(req.params.id);
    if (!run || run.input_hash !== state.inputHash)
      throw fail("Сначала выведите актуальные результаты олимпиады.", 409);
    const rows = JSON.parse(run.results)
      .filter((r) => r.centerId === req.params.center)
      .sort(compareAwardRows);
    if (!rows.length) throw fail("Образовательный центр не найден.", 404);
    const book = new ExcelJS.Workbook();
    book.creator = "IQ LAND";
    const sheet = book.addWorksheet("Результаты", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:4",
      },
    });
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = `IQ LAND · ${state.event.title}`;
    sheet.mergeCells("A2:H2");
    sheet.getCell("A2").value =
      `${rows[0].center} · ${rows[0].city} · ${state.event.date}`;
    sheet.mergeCells("A3:H3");
    sheet.getCell("A3").value =
      "Места: золото → серебро → бронза; внутри места — предмет, возрастная категория и баллы.";
    const headers = [
      "Место",
      "Предмет",
      "Возрастная категория",
      "ФИО ученика",
      "Возраст",
      "Класс",
      "Баллы",
      "Рейтинг в категории",
    ];
    sheet.addRow(headers);
    sheet.columns = [16, 29, 25, 37, 12, 12, 15, 24].map((width) => ({
      width,
    }));
    for (const row of rows)
      sheet.addRow([
        MEDALS[row.medal],
        row.subject,
        row.categoryLabel,
        row.name,
        row.age,
        row.grade,
        row.score,
        row.rank,
      ]);
    const fills = { Золото: "FFF5DC", Серебро: "EEF1F6", Бронза: "F8E8DC" };
    sheet.eachRow((row, i) => {
      row.height = i === 1 ? 36 : i <= 4 ? 30 : 34;
      row.font = {
        name: "Calibri",
        size: i === 1 ? 16 : 11,
        bold: i === 1 || i === 4,
        color: { argb: i === 1 || i === 4 ? "FFFFFFFF" : "FF192851" },
      };
      row.alignment = { vertical: "middle", wrapText: true };
      if (i === 1 || i === 4 || i > 4)
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: i <= 4 ? "FF192851" : "FF" + fills[row.getCell(1).value],
          },
        };
    });
    sheet.autoFilter = { from: "A4", to: "H4" };
    res.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.set(
      "Content-Disposition",
      `attachment; filename="IQ-LAND-results-${req.params.center}.xlsx"; filename*=UTF-8''${encodeURIComponent(`IQ LAND — ${rows[0].center}.xlsx`)}`,
    );
    await book.xlsx.write(res);
    res.end();
  }),
);
