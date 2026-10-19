import test from "node:test";
import assert from "node:assert/strict";
import {
  ageOn,
  normalizeCategories,
  assignMedals,
  compareAwardRows,
  DEFAULT_CATEGORIES,
  MAX_SCORE,
} from "../shared/award-rules.js";
const rows = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `entry-${i}`,
    name: `Ученик ${i}`,
    age: 12,
    subject: "Математика",
    score: n - i,
    ...extra,
  }));
const counts = (list) =>
  list.reduce(
    (a, r) => {
      a[r.medal]++;
      return a;
    },
    { gold: 0, silver: 0, bronze: 0 },
  );

test("age is completed years on the event date, with exact calendar validation", () => {
  assert.equal(ageOn("2013-10-20", "2026-10-19"), 12);
  assert.equal(ageOn("2013-10-19", "2026-10-19"), 13);
  assert.equal(ageOn("2013-10-18", "2026-10-19"), 13);
  assert.equal(ageOn("2012-02-29", "2025-02-28"), 12);
  assert.equal(ageOn("2012-02-29", "2025-03-01"), 13);
  for (const birth of ["2013-02-29", "2027-01-01", "2015-13-01", "wrong", null])
    assert.equal(ageOn(birth, "2026-10-19"), null);
  assert.equal(ageOn("2013-10-19", "2026-02-31"), null);
});
test("categories sort, allow adjacent nonoverlapping ranges and reject shared endpoints/malformed data", () => {
  assert.deepEqual(
    normalizeCategories([
      { minAge: 14, maxAge: 15 },
      { minAge: 12, maxAge: 13 },
    ]).map((c) => c.id),
    ["12-13", "14-15"],
  );
  for (const c of [
    [],
    null,
    [null],
    [
      { minAge: 12, maxAge: 13 },
      { minAge: 13, maxAge: 14 },
    ],
    [{ minAge: 7, maxAge: 6 }],
    [{ minAge: 6.1, maxAge: 7 }],
    [{ minAge: -1, maxAge: 7 }],
    [{ minAge: 7, maxAge: 100 }],
  ])
    assert.throws(() => normalizeCategories(c));
});
test("30/30/40 is calculated independently for every subject and category, irrespective of center or class", () => {
  const input = [
    ...rows(10),
    ...rows(10, { age: 14 }).map((r) => ({
      ...r,
      id: "older" + r.id,
      score: r.score + 500,
    })),
    ...rows(10, { subject: "Английский язык" }).map((r) => ({
      ...r,
      id: "english" + r.id,
      score: r.score / 100,
    })),
  ];
  const result = assignMedals(
    input.map((r, i) => ({
      ...r,
      center: i % 2 ? "Центр 1" : "Центр 2",
      grade: (i % 3) + 4,
    })),
    DEFAULT_CATEGORIES,
  );
  assert.deepEqual(counts(result), { gold: 9, silver: 9, bronze: 12 });
  for (const group of [
    result.filter((r) => r.age === 14),
    result.filter((r) => r.subject === "Английский язык"),
    result.filter((r) => r.age === 12 && r.subject === "Математика"),
  ])
    assert.deepEqual(counts(group), { gold: 3, silver: 3, bronze: 4 });
  assert.equal(result.find((r) => r.id === "entry-0").medal, "gold");
  assert.equal(result.find((r) => r.id === "entry-3").medal, "silver");
  assert.equal(result.find((r) => r.id === "entry-6").medal, "bronze");
  assert.deepEqual(counts(assignMedals(rows(100), DEFAULT_CATEGORIES)), {
    gold: 30,
    silver: 30,
    bronze: 40,
  });
});
test("ties at boundaries share the higher medal; cutoffs round up for small groups", () => {
  const input = rows(10).map((r, i) => ({
    ...r,
    score: i === 3 ? 8 : i === 6 ? 5 : r.score,
  }));
  const result = assignMedals(input, DEFAULT_CATEGORIES);
  assert.deepEqual(counts(result), { gold: 4, silver: 3, bronze: 3 });
  assert.equal(result.find((r) => r.id === "entry-3").rank, 3);
  assert.equal(result.find((r) => r.id === "entry-6").medal, "silver");
  assert.deepEqual(counts(assignMedals(rows(1), DEFAULT_CATEGORIES)), {
    gold: 1,
    silver: 0,
    bronze: 0,
  });
  assert.deepEqual(counts(assignMedals(rows(2), DEFAULT_CATEGORIES)), {
    gold: 1,
    silver: 1,
    bronze: 0,
  });
  assert.deepEqual(counts(assignMedals(rows(3), DEFAULT_CATEGORIES)), {
    gold: 1,
    silver: 1,
    bronze: 1,
  });
  assert.deepEqual(
    counts(assignMedals(rows(10, { score: 0 }), DEFAULT_CATEGORIES)),
    { gold: 10, silver: 0, bronze: 0 },
  );
});
test("no partial results for missing scores or uncovered ages; zero and large mental-arithmetic scores are valid", () => {
  for (const extra of [
    { score: null },
    { score: NaN },
    { score: -1 },
    { score: MAX_SCORE + 1 },
    { age: null },
    { age: 16 },
  ])
    assert.throws(() => assignMedals(rows(1, extra), DEFAULT_CATEGORIES));
  assert.equal(
    assignMedals(rows(1, { score: MAX_SCORE }), DEFAULT_CATEGORIES)[0].medal,
    "gold",
  );
  assert.throws(() => assignMedals([], DEFAULT_CATEGORIES));
});
test("center results sort medal first, then subject and age, preserving numeric scores", () => {
  const input = [
    ...rows(10),
    ...rows(10, { subject: "Английский язык" }).map((r) => ({
      ...r,
      id: "english" + r.id,
    })),
    ...rows(10, { subject: "Ментальная арифметика" }).map((r) => ({
      ...r,
      id: "mental" + r.id,
    })),
  ];
  const result = assignMedals(input, DEFAULT_CATEGORIES).sort(compareAwardRows);
  assert.deepEqual(
    result.slice(0, 9).map((r) => r.medal),
    Array(9).fill("gold"),
  );
  assert.deepEqual(
    result.slice(0, 9).map((r) => r.subject),
    [
      ...Array(3).fill("Ментальная арифметика"),
      ...Array(3).fill("Английский язык"),
      ...Array(3).fill("Математика"),
    ],
  );
});
