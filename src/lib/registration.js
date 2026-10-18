const currentDate = () => new Date().toISOString().slice(0, 10);
let studentSequence = 0;

export function makeStudent(availableSubjects, defaults = {}) {
  return {
    name: "",
    birth: "",
    grade: "",
    ...defaults,
    // Local UI keys must also work on HTTP without Web Crypto.
    key: `student-${Date.now().toString(36)}-${++studentSequence}`,
    subjects: [...(defaults.subjects ?? availableSubjects.slice(0, 1))],
  };
}

export function validateStudent(
  student,
  availableSubjects,
  today = currentDate(),
) {
  const errors = {};
  const name = typeof student?.name === "string" ? student.name.trim() : "";
  if (name.length < 2 || name.length > 150)
    errors.name = "Укажите имя и фамилию: от 2 до 150 символов.";

  const birth = student?.birth;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(birth ?? "")
    ? new Date(`${birth}T00:00:00.000Z`)
    : new Date(NaN);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birth ||
    birth < "1990-01-01" ||
    birth >= today
  )
    errors.birth =
      "Укажите настоящую дату рождения с 1990 года, раньше сегодняшнего дня.";

  const grade = student?.grade;
  if (
    !["string", "number"].includes(typeof grade) ||
    (typeof grade === "string" && !grade.trim()) ||
    !Number.isInteger(Number(grade)) ||
    Number(grade) < 0 ||
    Number(grade) > 12
  )
    errors.grade = "Укажите класс от 0 до 12. Для дошкольника выберите 0.";

  if (
    !Array.isArray(student?.subjects) ||
    !student.subjects.length ||
    student.subjects.some((subject) => !availableSubjects.includes(subject))
  )
    errors.subjects = "Выберите хотя бы одну дисциплину этой олимпиады.";

  return errors;
}

function normalizeDate(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function isHeader(columns) {
  return (
    /^(фио|фамилия|имя|name|full\s*name|student)(\s|$)/i.test(columns[0]) &&
    /дата|рожд|birth/i.test(columns[1] ?? "") &&
    /класс|grade/i.test(columns[2] ?? "")
  );
}

export function parseStudentList(
  text,
  availableSubjects,
  defaults = {},
  today = currentDate(),
) {
  const students = [];
  const errors = [];
  let firstRow = true;
  let rows = 0;
  const lines = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r\n?|\n/);

  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const columns = line
      .split(line.includes("\t") ? "\t" : ";")
      .map((value) => value.trim());
    if (firstRow && isHeader(columns)) {
      firstRow = false;
      continue;
    }
    firstRow = false;
    rows += 1;
    if (rows > 300) {
      errors.push({
        line: index + 1,
        message: "В одной заявке может быть не более 300 учеников.",
      });
      break;
    }
    if (columns.length < 3 || columns.length > 4) {
      errors.push({
        line: index + 1,
        message:
          "Нужны три столбца: ФИО, дата рождения, класс. Четвёртый — дисциплины через запятую.",
      });
      continue;
    }
    const [name, birth, grade, subjects] = columns;
    const student = makeStudent(availableSubjects, {
      ...defaults,
      name,
      birth: normalizeDate(birth),
      grade,
    });
    if (subjects) {
      student.subjects = [
        ...new Set(
          subjects.split(",").map((value) => {
            const subject = value.trim();
            return (
              availableSubjects.find(
                (candidate) =>
                  candidate.toLocaleLowerCase("ru-RU") ===
                  subject.toLocaleLowerCase("ru-RU"),
              ) ?? subject
            );
          }),
        ),
      ];
    }
    const messages = Object.values(
      validateStudent(student, availableSubjects, today),
    );
    if (messages.length)
      errors.push({ line: index + 1, message: messages.join(" ") });
    else students.push(student);
  }

  if (!rows)
    errors.push({
      line: lines.length,
      message: "Добавьте хотя бы одну строку с учеником.",
    });
  return { students: errors.length ? [] : students, errors };
}

export function rosterStats(
  students,
  availableSubjects,
  today = currentDate(),
) {
  const ready = students.filter(
    (student) =>
      !Object.keys(validateStudent(student, availableSubjects, today)).length,
  ).length;
  return { total: students.length, ready, issues: students.length - ready };
}

export function findDuplicates(students) {
  const signatures = students.map((student) => {
    const name = student.name?.trim().toLocaleLowerCase("ru-RU");
    return name && student.birth ? JSON.stringify([name, student.birth]) : null;
  });
  const counts = new Map();
  for (const signature of signatures)
    if (signature) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  return students
    .filter((_, index) => (counts.get(signatures[index]) ?? 0) > 1)
    .map((student) => student.key);
}

export function validateContact(contact, teachers = []) {
  const errors = {};
  for (const field of ["center", "city", "teacher"]) {
    const value =
      typeof contact?.[field] === "string" ? contact[field].trim() : "";
    if (value.length < 2 || value.length > 150)
      errors[field] = "Заполните поле: от 2 до 150 символов.";
  }

  // Match the practical email format used by the API's Zod schema.
  const email = contact?.email;
  const emailPattern =
    /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  if (
    typeof email !== "string" ||
    email.length > 200 ||
    !emailPattern.test(email)
  )
    errors.email = "Укажите действующий email, не более 200 символов.";

  const phone = typeof contact?.phone === "string" ? contact.phone.trim() : "";
  if (!/^\+?[\d\s()\-]{7,25}$/.test(phone))
    errors.phone = "Проверьте номер телефона: от 7 до 25 символов.";

  if (
    contact?.note !== undefined &&
    (typeof contact.note !== "string" || contact.note.trim().length > 2000)
  )
    errors.note = "Комментарий должен быть не длиннее 2000 символов.";

  if (!Array.isArray(teachers) || teachers.length > 30)
    errors.teachers = "Можно добавить не более 30 преподавателей.";
  if (Array.isArray(teachers)) {
    teachers.forEach((teacher, index) => {
      const value = typeof teacher === "string" ? teacher.trim() : "";
      if (value.length < 2 || value.length > 150)
        errors[`teachers.${index}`] =
          "Укажите имя преподавателя: от 2 до 150 символов.";
    });
  }
  return errors;
}

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function ownValue(record, key) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function boundedString(value, length) {
  return typeof value === "string" ? value.slice(0, length) : "";
}

function isoTimestamp(value) {
  if (typeof value !== "string" || value.length > 35) return "";
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) return "";
  const day = new Date(`${match[1]}T00:00:00.000Z`);
  const timestamp = new Date(value);
  return Number.isFinite(day.getTime()) &&
    Number.isFinite(timestamp.getTime()) &&
    day.toISOString().slice(0, 10) === match[1]
    ? timestamp.toISOString()
    : "";
}

export function sanitizeDraft(value, availableSubjects) {
  if (!isRecord(value) || ownValue(value, "version") !== 1) return null;
  const students = ownValue(value, "students");
  if (
    !Array.isArray(students) ||
    students.length < 1 ||
    students.length > 300 ||
    !students.every(isRecord)
  )
    return null;

  const savedContact = ownValue(value, "contact");
  const contact = isRecord(savedContact) ? savedContact : {};
  const teachers = ownValue(value, "teachers");
  return {
    version: 1,
    students: students.map((student) => {
      const savedSubjects = ownValue(student, "subjects");
      const selected = Array.isArray(savedSubjects)
        ? [
            ...new Set(
              savedSubjects.filter((subject) =>
                availableSubjects.includes(subject),
              ),
            ),
          ]
        : [];
      const grade = ownValue(student, "grade");
      return makeStudent(availableSubjects, {
        name: boundedString(ownValue(student, "name"), 150),
        birth: boundedString(ownValue(student, "birth"), 10),
        grade:
          typeof grade === "number" && Number.isFinite(grade)
            ? String(grade).slice(0, 10)
            : boundedString(grade, 10),
        subjects: selected.length ? selected : availableSubjects.slice(0, 1),
      });
    }),
    contact: Object.fromEntries(
      Object.entries({
        center: 150,
        city: 150,
        teacher: 150,
        email: 200,
        phone: 25,
        note: 2000,
      }).map(([field, limit]) => [
        field,
        boundedString(ownValue(contact, field), limit),
      ]),
    ),
    teachers: Array.isArray(teachers)
      ? teachers.slice(0, 30).map((teacher) => boundedString(teacher, 150))
      : [],
    savedAt: isoTimestamp(ownValue(value, "savedAt")),
  };
}
