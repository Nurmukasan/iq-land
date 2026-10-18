import test from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicates,
  makeStudent,
  parseStudentList,
  rosterStats,
  sanitizeDraft,
  validateContact,
  validateStudent,
} from "../src/lib/registration.js";

const subjects = ["Математика", "Английский язык"];
const today = "2026-10-19";
const validStudent = (fields = {}) => ({
  key: "student-1",
  name: "Ахметова Алия",
  birth: "2015-03-15",
  grade: "5",
  subjects: [subjects[0]],
  ...fields,
});

test("student defaults get fresh keys and independent subject selections", () => {
  const defaults = { grade: "4", subjects: [subjects[1]] };
  const first = makeStudent(subjects, defaults);
  const second = makeStudent(subjects, defaults);
  assert.notEqual(first.key, second.key);
  assert.deepEqual(makeStudent(subjects).subjects, [subjects[0]]);
  assert.equal(first.name, "");
  assert.equal(first.birth, "");
  assert.equal(first.grade, "4");
  first.subjects.push(subjects[0]);
  assert.deepEqual(second.subjects, [subjects[1]]);
  assert.deepEqual(defaults.subjects, [subjects[1]]);
  assert.deepEqual(makeStudent([]).subjects, []);
});

test("student rows, imports and drafts work without Web Crypto", (t) => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
  });
  t.after(() => Object.defineProperty(globalThis, "crypto", cryptoDescriptor));
  t.mock.method(Date, "now", () => 0);

  const students = Array.from({ length: 300 }, () => makeStudent(subjects));
  assert.equal(new Set(students.map((student) => student.key)).size, 300);
  const imported = parseStudentList(
    "Ахметова Алия;15.03.2015;5",
    subjects,
    {},
    today,
  );
  assert.deepEqual(imported.errors, []);
  const restored = sanitizeDraft(
    { version: 1, students: imported.students },
    subjects,
  );
  assert.equal(restored.students[0].name, "Ахметова Алия");
  assert.notEqual(restored.students[0].key, imported.students[0].key);
});

test("TSV import retains names, dates, preschool grade and explicit disciplines", () => {
  const result = parseStudentList(
    "ФИО\tДата рождения\tКласс\tДисциплины\r\nАхметова Алия\t15.03.2015\t5\tМатематика, английский язык\r\nПетров Тимур\t2020-07-22\t0\tАнглийский язык\r\n",
    subjects,
    {},
    today,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.students.length, 2);
  assert.equal(result.students[0].birth, "2015-03-15");
  assert.deepEqual(result.students[0].subjects, subjects);
  assert.equal(result.students[1].grade, "0");
  assert.deepEqual(result.students[1].subjects, [subjects[1]]);
});

test("semicolon imports use selected defaults when no discipline column is given", () => {
  const result = parseStudentList(
    "  Ахметова Алия ; 2015-03-15 ; 5 \nПетров Тимур;22.07.2014;6",
    subjects,
    { subjects: [subjects[1]], grade: "3" },
    today,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.students[0].name, "Ахметова Алия");
  assert.equal(result.students[0].grade, "5");
  assert.ok(
    result.students.every((student) => student.subjects[0] === subjects[1]),
  );
});

test("validation rejects impossible, out-of-range and noncanonical dates", () => {
  for (const birth of [
    "2015-02-29",
    "2015-02-31",
    "2015-13-01",
    "2015-1-01",
    "1989-12-31",
    today,
    "2026-10-20",
    "",
  ]) {
    assert.ok(
      validateStudent(validStudent({ birth }), subjects, today).birth,
      birth,
    );
  }
  for (const birth of ["1990-01-01", "2016-02-29", "2026-10-18"])
    assert.deepEqual(
      validateStudent(validStudent({ birth }), subjects, today),
      {},
    );
});

test("missing, whitespace and invalid grade values cannot become preschool grade zero", () => {
  for (const grade of [
    undefined,
    null,
    "",
    " ",
    false,
    true,
    "5.5",
    -1,
    13,
    NaN,
    Infinity,
  ])
    assert.ok(
      validateStudent(validStudent({ grade }), subjects, today).grade,
      String(grade),
    );
  for (const grade of [0, "0", 12, "12"])
    assert.deepEqual(
      validateStudent(validStudent({ grade }), subjects, today),
      {},
    );
});

test("name and discipline validation returns field errors", () => {
  assert.ok(validateStudent(validStudent({ name: "А" }), subjects, today).name);
  assert.ok(
    validateStudent(validStudent({ name: "А".repeat(151) }), subjects, today)
      .name,
  );
  for (const selected of [
    undefined,
    [],
    ["Ментальная арифметика"],
    [subjects[0], "Химия"],
  ])
    assert.ok(
      validateStudent(validStudent({ subjects: selected }), subjects, today)
        .subjects,
    );
  assert.deepEqual(Object.keys(validateStudent(null, subjects, today)), [
    "name",
    "birth",
    "grade",
    "subjects",
  ]);
});

test("an import with any invalid row is atomic and reports original line numbers", () => {
  const result = parseStudentList(
    "ФИО\tДата рождения\tКласс\n\nАхметова Алия\t2015-03-15\t5\nИванов Иван\t2015-02-31\t6\nПетров Тимур\t2014-01-01\t\nСмирнова Аня\t2015-01-01",
    subjects,
    {},
    today,
  );
  assert.deepEqual(result.students, []);
  assert.deepEqual(
    result.errors.map((error) => error.line),
    [4, 5, 6],
  );
  assert.match(result.errors[1].message, /класс/i);
});

test("unknown imported disciplines are errors and duplicate selections are normalized", () => {
  const bad = parseStudentList(
    "Иванов Иван;2014-01-01;5;Химия",
    subjects,
    {},
    today,
  );
  assert.deepEqual(bad.students, []);
  assert.equal(bad.errors[0].line, 1);
  const good = parseStudentList(
    "Иванов Иван;2014-01-01;5;Математика, математика",
    subjects,
    {},
    today,
  );
  assert.deepEqual(good.students[0].subjects, [subjects[0]]);
});

test("empty text, header-only text and imports over 300 students return user errors", () => {
  for (const text of ["", " \n\t", "ФИО;Дата рождения;Класс\n"]) {
    const result = parseStudentList(text, subjects, {}, today);
    assert.deepEqual(result.students, []);
    assert.ok(result.errors.length);
  }
  const rows = Array.from(
    { length: 301 },
    (_, index) => `Ученик ${index};2015-01-01;5`,
  );
  assert.equal(
    parseStudentList(rows.slice(0, 300).join("\n"), subjects, {}, today)
      .students.length,
    300,
  );
  const tooMany = parseStudentList(rows.join("\n"), subjects, {}, today);
  assert.deepEqual(tooMany.students, []);
  assert.equal(tooMany.errors[0].line, 301);
  assert.match(tooMany.errors[0].message, /300/);
});

test("stats count ready students and duplicate detection flags rows without deleting them", () => {
  const students = [
    validStudent(),
    validStudent({ key: "student-2", name: "  АХМЕТОВА АЛИЯ  " }),
    validStudent({ key: "student-3", birth: "2016-03-15" }),
    makeStudent(subjects),
    makeStudent(subjects),
  ];
  assert.deepEqual(rosterStats(students, subjects, today), {
    total: 5,
    ready: 3,
    issues: 2,
  });
  assert.deepEqual(findDuplicates(students), ["student-1", "student-2"]);
  assert.equal(students.length, 5);
  assert.deepEqual(rosterStats([], subjects, today), {
    total: 0,
    ready: 0,
    issues: 0,
  });
});

const validContact = {
  center: "IQ Academy",
  city: "Алматы",
  teacher: "Ахметова Алия",
  email: "teacher@example.com",
  phone: "+7 (700) 123-45-67",
  note: "Команда из пяти учеников",
};

test("contact validation accepts API-compatible details and trims text fields", () => {
  assert.deepEqual(validateContact(validContact, ["Другой Преподаватель"]), {});
  assert.deepEqual(
    validateContact(
      {
        ...validContact,
        center: "  IQ Academy  ",
        city: "  Алматы ",
        teacher: "  Ахметова Алия  ",
        phone: "  +7 (700) 123-45-67  ",
        note: " ".repeat(2001),
      },
      ["  Другой Преподаватель  "],
    ),
    {},
  );
});

test("contact validation rejects whitespace names and invalid email or phone", () => {
  const errors = validateContact(
    {
      ...validContact,
      center: " ",
      city: "А",
      teacher: "А".repeat(151),
      email: "bad..mail@example.com",
      phone: "+7 CALL-NOW",
      note: "А".repeat(2001),
    },
    [" ", "А".repeat(151)],
  );
  assert.deepEqual(Object.keys(errors), [
    "center",
    "city",
    "teacher",
    "email",
    "phone",
    "note",
    "teachers.0",
    "teachers.1",
  ]);
  assert.ok(
    validateContact({ ...validContact, email: "teacher@example.com " }).email,
  );
  assert.ok(
    validateContact({
      ...validContact,
      email: `${"a".repeat(190)}@example.com`,
    }).email,
  );
  assert.ok(
    validateContact(validContact, Array(31).fill("Преподаватель")).teachers,
  );
  assert.ok(validateContact(validContact, null).teachers);
  assert.ok(validateContact(null).center);
});

test("draft restoration rejects invalid versions, sizes, records and primitive storage values", () => {
  for (const value of [
    null,
    undefined,
    "{}",
    false,
    [],
    1,
    {},
    { version: 2, students: [validStudent()] },
    { version: 1, students: [] },
    { version: 1, students: [validStudent(), null] },
    { version: 1, students: [validStudent(), "broken"] },
    { version: 1, students: Array(301).fill(validStudent()) },
    Object.create({ version: 1, students: [validStudent()] }),
  ])
    assert.equal(sanitizeDraft(value, subjects), null);
});

test("draft restoration safely keeps all rows, grade zero and only available disciplines", () => {
  const draft = sanitizeDraft(
    {
      version: 1,
      students: [
        {
          ...validStudent({ grade: 0 }),
          password: "must-not-copy",
          subjects: ["Химия", subjects[1], subjects[1]],
        },
        {
          ...validStudent({ key: "old-key", name: "", grade: "" }),
          subjects: ["Химия"],
        },
        {},
      ],
      contact: {
        ...validContact,
        password: "must-not-copy",
        center: "А".repeat(200),
      },
      teachers: ["Другой Преподаватель", null],
      savedAt: "2026-10-19T12:30:00.000Z",
      consent: true,
      password: "must-not-copy",
      token: "must-not-copy",
    },
    subjects,
  );
  assert.equal(draft.students.length, 3);
  assert.equal(draft.students[0].grade, "0");
  assert.deepEqual(draft.students[0].subjects, [subjects[1]]);
  assert.deepEqual(draft.students[1].subjects, [subjects[0]]);
  assert.equal(draft.students[1].grade, "");
  assert.equal(draft.students[2].name, "");
  assert.equal(draft.students[2].grade, "");
  assert.notEqual(draft.students[0].key, "student-1");
  assert.notEqual(draft.students[1].key, "old-key");
  assert.equal(new Set(draft.students.map((student) => student.key)).size, 3);
  assert.equal(draft.contact.center.length, 150);
  assert.deepEqual(draft.teachers, ["Другой Преподаватель", ""]);
  assert.equal(draft.savedAt, "2026-10-19T12:30:00.000Z");
  assert.deepEqual(Object.keys(draft), [
    "version",
    "students",
    "contact",
    "teachers",
    "savedAt",
  ]);
  assert.ok(!JSON.stringify(draft).includes("must-not-copy"));
});

test("draft restoration bounds teacher names and rejects invalid timestamps", () => {
  const draft = { version: 1, students: [validStudent()] };
  for (const savedAt of ["tomorrow", "2026-02-31T00:00:00.000Z", 123, null])
    assert.equal(sanitizeDraft({ ...draft, savedAt }, subjects).savedAt, "");
  assert.equal(
    sanitizeDraft({ ...draft, savedAt: "2026-10-19T12:30:00Z" }, subjects)
      .savedAt,
    "2026-10-19T12:30:00.000Z",
  );
  assert.equal(
    sanitizeDraft(
      { ...draft, teachers: Array(31).fill("А".repeat(151)) },
      subjects,
    ).teachers.length,
    30,
  );
  assert.equal(
    sanitizeDraft({ ...draft, teachers: ["А".repeat(151)] }, subjects)
      .teachers[0].length,
    150,
  );
  assert.deepEqual(sanitizeDraft(draft, subjects).contact, {
    center: "",
    city: "",
    teacher: "",
    email: "",
    phone: "",
    note: "",
  });
  assert.deepEqual(sanitizeDraft(draft, subjects).teachers, []);
});
