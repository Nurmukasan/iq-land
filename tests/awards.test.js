import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  awardsFixture,
  eventPayload,
  teamPayload,
  today,
} from "./awards-fixture.mjs";
const subjects = ["Ментальная арифметика", "Английский язык", "Математика"];

test("director awards workflow: 200 pupils, independent age categories, atomic saves, private center workbooks and durable snapshots", async (t) => {
  const api = await awardsFixture();
  t.after(() => api.close());
  const id = await api.create(
    eventPayload({ telegramUrl: "https://t.me/iqland_test_channel" }),
  );
  const older = await api.create(
    eventPayload({ date: "2001-01-01", deadline: "2001-01-01", active: false }),
  );
  const future = await api.create(
    eventPayload({ date: "2099-01-01", deadline: "2099-01-01" }),
  );
  const auth = { cookie: api.director };
  const registrations = [];
  let state;
  const get = async () => {
    const r = await api.request("/awards/" + id, auth);
    assert.equal(r.res.status, 200);
    return r.data;
  };
  const generate = async (expectedHash) =>
    await api.request(`/awards/${id}/generate`, {
      ...auth,
      method: "POST",
      body: { expectedHash },
    });
  await t.test(
    "both organizer roles are admitted; unauthenticated and future-event scoring is rejected",
    async () => {
      assert.equal((await api.request("/awards")).res.status, 401);
      assert.equal((await api.request("/awards/" + id)).res.status, 401);
      assert.equal(
        (await api.request("/awards/" + id, { cookie: api.admin })).res.status,
        200,
      );
      assert.deepEqual(
        (await api.request("/awards", auth)).data.map((e) => e.id),
        [id, older],
      );
      assert.equal(
        (await api.request("/awards/" + future, auth)).res.status,
        409,
      );
      assert.equal(
        (
          await api.request(`/awards/${future}/scores`, {
            ...auth,
            method: "PUT",
            body: { scores: [{ id: "anything", score: 5 }] },
          })
        ).res.status,
        409,
      );
    },
  );
  await t.test(
    "real registrations yield 200 pupils / 600 entries and expose only their Telegram channel",
    async () => {
      for (let team = 0; team < 8; team++) {
        const center = team % 4;
        const city = center === 3 ? "Алматы" : "Астана";
        const name = ["Альфа", "Бета", "Гамма", "Альфа"][center];
        const result = await api.request("/registrations", {
          method: "POST",
          body: teamPayload(id, {
            center: team >= 4 ? `  ${name.toUpperCase()}  ` : name,
            city: team >= 4 ? city.toLowerCase() : city,
            students: Array.from({ length: 25 }, (_, i) => {
              const index = team * 25 + i;
              return {
                name: `ТЕСТ Ученик ${String(index + 1).padStart(3, "0")}`,
                birth: `${Number(today.slice(0, 4)) - (6 + (index % 10))}-01-01`,
                grade: Math.min(10, 1 + (index % 10)),
                subjects,
              };
            }),
          }),
        });
        assert.equal(result.res.status, 201, JSON.stringify(result.data));
        assert.equal(result.data.count, 25);
        assert.equal(
          result.data.telegramUrl,
          "https://t.me/iqland_test_channel",
        );
        registrations.push(result.data.id);
      }
      state = await get();
      assert.equal(state.summary.participants, 200);
      assert.equal(state.rows.length, 600);
      assert.equal(state.categories.length, 5);
      assert.equal(state.summary.uncategorized, 0);
      assert.equal(
        new Set(state.rows.map((r) => r.centerId)).size,
        4,
        "Case and whitespace normalize; same center name in different cities remains separate",
      );
      for (let i = 1; i < state.rows.length; i++)
        assert.ok(
          state.rows[i].age >= state.rows[i - 1].age,
          "Roster must be age-sorted",
        );
      assert.equal(
        (await generate(state.inputHash)).res.status,
        400,
        "Missing scores block the entire calculation",
      );
      assert.equal(
        (await api.request(`/awards/${id}/centers/unknown/export`, auth)).res
          .status,
        409,
      );
    },
  );
  await t.test(
    "category overlaps and malformed objects are rejected without changing the defaults",
    async () => {
      for (const categories of [
        [
          { minAge: 12, maxAge: 13 },
          { minAge: 13, maxAge: 14 },
        ],
        [null],
        [],
        [{ minAge: 6.5, maxAge: 7 }],
      ]) {
        assert.equal(
          (
            await api.request(`/awards/${id}/categories`, {
              ...auth,
              method: "PUT",
              body: { categories },
            })
          ).res.status,
          400,
        );
      }
      assert.deepEqual((await get()).categories, state.categories);
    },
  );
  await t.test(
    "score batches are atomic, check event membership and accept zero / decimal / high scores",
    async () => {
      const first = state.rows[0];
      const bad = await api.request(`/awards/${id}/scores`, {
        ...auth,
        method: "PUT",
        body: {
          scores: [
            { id: first.id, score: 10, previous: null },
            { id: "foreign-entry", score: 20 },
          ],
        },
      });
      assert.equal(bad.res.status, 409);
      assert.equal(
        (await get()).rows.find((r) => r.id === first.id).score,
        null,
      );
      assert.equal(
        (
          await api.request(`/awards/${id}/scores`, {
            ...auth,
            method: "PUT",
            body: { scores: [{ id: first.id, score: 1_000_001 }] },
          })
        ).res.status,
        400,
      );
      const scoreRows = state.rows.map((r) => ({
        id: r.id,
        previous: null,
        score: r.name.endsWith("200")
          ? 0
          : 1000 -
            Number(r.name.slice(-3)) +
            (r.subject === "Ментальная арифметика" ? 1000 : 0) +
            (r.subject === "Английский язык" ? 0.5 : 0),
      }));
      const saved = await api.request(`/awards/${id}/scores`, {
        ...auth,
        method: "PUT",
        body: { scores: scoreRows },
      });
      assert.equal(saved.res.status, 200);
      state = saved.data;
      assert.equal(state.summary.missingScores, 0);
      assert.equal(state.rows.filter((r) => r.score === 0).length, 3);
      assert.ok(state.rows.some((r) => r.score > 100));
      assert.ok(state.rows.some((r) => r.score % 1 === 0.5));
      assert.equal(
        (await generate("0".repeat(64))).res.status,
        409,
        "Stale roster hash cannot generate results",
      );
    },
  );
  await t.test(
    "generation yields exactly 30/30/40 for each of 15 subject/category groups and four center files",
    async () => {
      const result = await generate(state.inputHash);
      assert.equal(result.res.status, 200, JSON.stringify(result.data));
      state = result.data;
      assert.deepEqual(state.result.counts, {
        gold: 180,
        silver: 180,
        bronze: 240,
      });
      assert.equal(state.result.stale, false);
      assert.equal(state.result.centers.length, 4);
      const awards = api.withDb((db) =>
        JSON.parse(
          db.prepare("SELECT results FROM award_runs WHERE event_id=?").get(id)
            .results,
        ),
      );
      for (const category of state.categories)
        for (const subject of subjects) {
          const list = awards.filter(
            (r) => r.categoryId === category.id && r.subject === subject,
          );
          assert.equal(list.length, 40);
          for (const [medal, n] of [
            ["gold", 12],
            ["silver", 12],
            ["bronze", 16],
          ])
            assert.equal(list.filter((r) => r.medal === medal).length, n);
        }
    },
  );
  await t.test(
    "XLSX is private, contains only one center, sorts medal first then subject, and retains numeric scores",
    async () => {
      const total = [];
      const medalOrder = { Золото: 0, Серебро: 1, Бронза: 2 };
      for (const center of state.result.centers) {
        const path = `/awards/${id}/centers/${center.id}/export`;
        assert.equal((await api.request(path)).res.status, 401);
        const { res, data } = await api.request(path, auth);
        assert.equal(res.status, 200);
        assert.match(
          res.headers.get("content-disposition"),
          /filename\*=UTF-8/,
        );
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(data);
        assert.equal(book.worksheets.length, 1);
        const sheet = book.getWorksheet("Результаты");
        assert.equal(sheet.rowCount, 154);
        assert.equal(sheet.views[0].ySplit, 4);
        assert.equal(sheet.autoFilter, "A4:H4");
        const list = [];
        for (let i = 5; i <= sheet.rowCount; i++) {
          const row = sheet.getRow(i);
          const [medal, subject, category, name, age, grade, score, rank] =
            row.values.slice(1);
          assert.ok(subjects.includes(subject));
          assert.ok(typeof score === "number");
          assert.ok(typeof age === "number");
          assert.ok(typeof rank === "number");
          assert.ok(row.getCell(1).fill.fgColor.argb);
          list.push({ medal, subject, name, age, score, rank });
        }
        assert.equal(list.length, 150);
        for (let i = 1; i < list.length; i++) {
          const prev = list[i - 1],
            next = list[i];
          assert.ok(medalOrder[prev.medal] <= medalOrder[next.medal]);
          if (prev.medal === next.medal)
            assert.ok(
              subjects.indexOf(prev.subject) <= subjects.indexOf(next.subject),
            );
        }
        const ownIds = new Set(
          state.rows.filter((r) => r.centerId === center.id).map((r) => r.name),
        );
        assert.ok(list.every((r) => ownIds.has(r.name)));
        assert.equal(new Set(list.map((r) => r.name)).size, 50);
        total.push(...list);
      }
      assert.equal(total.length, 600);
    },
  );
  await t.test(
    "concurrent score edits return conflict without overwriting and invalidate downloadable snapshots",
    async () => {
      const row = state.rows[0];
      const path = `/awards/${id}/scores`;
      const changed = await api.request(path, {
        ...auth,
        method: "PUT",
        body: { scores: [{ id: row.id, score: 1234, previous: row.score }] },
      });
      assert.equal(changed.res.status, 200);
      assert.equal(changed.data.result.stale, true);
      const conflict = await api.request(path, {
        ...auth,
        method: "PUT",
        body: { scores: [{ id: row.id, score: 999, previous: row.score }] },
      });
      assert.equal(conflict.res.status, 409);
      assert.equal((await get()).rows.find((r) => r.id === row.id).score, 1234);
      assert.equal(
        (
          await api.request(
            `/awards/${id}/centers/${state.result.centers[0].id}/export`,
            auth,
          )
        ).res.status,
        409,
      );
      assert.equal((await generate(state.inputHash)).res.status, 409);
      state = await get();
      state = (await generate(state.inputHash)).data;
      assert.equal(state.result.stale, false);
    },
  );
  await t.test(
    "cancellation / category edits invalidate results; recalculation excludes cancelled teams",
    async () => {
      assert.equal(
        (
          await api.request(`/registrations/${registrations[0]}/status`, {
            ...auth,
            method: "PATCH",
            body: { status: "cancelled" },
          })
        ).res.status,
        200,
      );
      state = await get();
      assert.equal(state.result.stale, true);
      assert.equal(state.rows.length, 525);
      assert.equal(state.summary.participants, 175);
      state = (await generate(state.inputHash)).data;
      assert.equal(state.result.stale, false);
      assert.equal(
        Object.values(state.result.counts).reduce((a, b) => a + b),
        525,
      );
      const c = await api.request(`/awards/${id}/categories`, {
        ...auth,
        method: "PUT",
        body: {
          categories: [
            { minAge: 6, maxAge: 9 },
            { minAge: 10, maxAge: 15 },
          ],
        },
      });
      assert.equal(c.res.status, 200);
      assert.equal(c.data.result.stale, true);
      state = (await generate(c.data.inputHash)).data;
      assert.equal(state.result.stale, false);
    },
  );
  await t.test(
    "new registrations and edited event dates invalidate the official files; legacy archive flags never reveal children",
    async () => {
      const created = await api.request("/registrations", {
        method: "POST",
        body: teamPayload(id),
      });
      assert.equal(created.res.status, 201);
      state = await get();
      assert.equal(state.result.stale, true);
      assert.equal(state.summary.missingScores, 1);
      assert.equal((await generate(state.inputHash)).res.status, 400);
      const row = state.rows.find((r) => r.score === null);
      await api.request(`/awards/${id}/scores`, {
        ...auth,
        method: "PUT",
        body: { scores: [{ id: row.id, score: 0, previous: null }] },
      });
      state = await get();
      state = (await generate(state.inputHash)).data;
      const past = "2025-10-19";
      assert.equal(
        (
          await api.request("/events/" + id, {
            ...auth,
            method: "PUT",
            body: eventPayload({ date: past, deadline: past }),
          })
        ).res.status,
        200,
      );
      state = await get();
      assert.equal(state.result.stale, true);
      api.withDb((db) =>
        db.prepare("UPDATE events SET results_published=1 WHERE id=?").run(id),
      );
      const recap = await api.request("/archive/" + id);
      assert.equal(recap.res.status, 200);
      assert.deepEqual(recap.data.results, []);
      assert.equal(recap.data.resultsPublished, false);
      assert.ok(!JSON.stringify(recap.data).includes("ТЕСТ Ученик"));
      assert.ok(
        !(await api.request("/archive")).data.some((e) => e.resultsPublished),
      );
    },
  );
  await t.test(
    "scores, categories, award snapshot, account hashes and existing sessions survive restart",
    async () => {
      const before = await get();
      const users = api.withDb((db) =>
        db.prepare("SELECT * FROM users ORDER BY id").all(),
      );
      const creds = readFileSync(
        join(api.dir, "initial-accounts.json"),
        "utf8",
      );
      await api.stop();
      await api.start();
      assert.deepEqual(await get(), before);
      assert.deepEqual(
        api.withDb((db) => db.prepare("SELECT * FROM users ORDER BY id").all()),
        users,
      );
      assert.equal(
        readFileSync(join(api.dir, "initial-accounts.json"), "utf8"),
        creds,
      );
    },
  );
});

test("legacy migration adds categories and Telegram without reusing WhatsApp links or losing private data", async (t) => {
  const api = await awardsFixture();
  t.after(() => api.close());
  const id = await api.create();
  const beforeUsers = api.withDb((db) =>
    db.prepare("SELECT * FROM users ORDER BY id").all(),
  );
  assert.equal(
    (
      await api.request("/registrations", {
        method: "POST",
        body: teamPayload(id),
      })
    ).res.status,
    201,
  );
  const before = (await api.request("/manage", { cookie: api.director })).data;
  await api.stop();
  api.withDb((db) => {
    db.exec("DROP TABLE award_runs");
    db.exec("ALTER TABLE events DROP COLUMN award_categories");
    db.exec("ALTER TABLE events DROP COLUMN telegram_url");
    db.prepare(
      "UPDATE events SET whatsapp_url=?,results_published=1 WHERE id=?",
    ).run("https://chat.whatsapp.com/LegacyInvite0000000000", id);
  });
  await api.start();
  const after = (await api.request("/manage", { cookie: api.director })).data;
  assert.deepEqual(after.entries, before.entries);
  assert.deepEqual(after.registrations, before.registrations);
  assert.equal(after.events[0].telegramUrl, "");
  assert.equal(after.events[0].resultsPublished, false);
  assert.ok(!JSON.stringify(after.events[0]).includes("LegacyInvite"));
  assert.deepEqual(
    api.withDb((db) => db.prepare("SELECT * FROM users ORDER BY id").all()),
    beforeUsers,
  );
  const state = (await api.request("/awards/" + id, { cookie: api.director }))
    .data;
  assert.equal(state.categories.length, 5);
  assert.equal(state.rows.length, 1);
  assert.equal(state.result, null);
  assert.equal(
    api.withDb(
      (db) =>
        db.prepare("SELECT whatsapp_url FROM events WHERE id=?").get(id)
          .whatsapp_url,
    ),
    "https://chat.whatsapp.com/LegacyInvite0000000000",
    "Historical field is preserved, never reinterpreted as Telegram",
  );
});
