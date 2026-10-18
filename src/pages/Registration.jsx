import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardPaste,
  Copy,
  Download,
  GraduationCap,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  api,
  dateLabel,
  priceLabel,
  Modal,
  Spinner,
  ErrorBox,
  useApp,
} from "../main";

function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const makeStudent = (subjects) => ({
  key: crypto.randomUUID(),
  name: "",
  birth: "",
  grade: "",
  subjects: [subjects[0]],
});
function parseDate(v) {
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
    const [d, m, y] = v.split(".");
    return `${y}-${m}-${d}`;
  }
  return v;
}
export default function Registration() {
  const { id } = useParams();
  const { notify } = useApp();
  const [event, setEvent] = useState(null),
    [loadError, setLoadError] = useState(""),
    [step, setStep] = useState(1),
    [students, setStudents] = useState([]),
    [contact, setContact] = useState({
      center: "",
      city: "",
      teacher: "",
      email: "",
      phone: "",
      note: "",
    }),
    [teachers, setTeachers] = useState([]),
    [paste, setPaste] = useState(false),
    [pasteText, setPasteText] = useState(""),
    [pasteError, setPasteError] = useState(""),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [sending, setSending] = useState(false),
    [receipt, setReceipt] = useState(null);
  const formRef = useRef(null);
  const load = () => {
    setLoadError("");
    api("/events/" + id)
      .then((e) => {
        setEvent(e);
        setStudents([makeStudent(e.subjects)]);
      })
      .catch((e) => setLoadError(e.message));
  };
  useEffect(load, [id]);
  useEffect(() => {
    const handler = (e) => {
      if (!receipt && (students.some((s) => s.name) || contact.center)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [students, contact, receipt]);
  function updateStudent(key, field, value) {
    setStudents((s) =>
      s.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
    setError("");
  }
  function next(e) {
    e.preventDefault();
    setError("");
    if (step === 1) {
      if (!students.length) {
        setError("Добавьте хотя бы одного ученика");
        return;
      }
      if (students.some((s) => !s.subjects.length)) {
        setError("Выберите хотя бы одну дисциплину каждому ученику");
        return;
      }
      if (students.some((s) => !s.name.trim() || s.name.trim().length < 2)) {
        setError("Укажите полное имя каждого ученика");
        return;
      }
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 180, behavior: "smooth" });
  }
  function importStudents() {
    const lines = pasteText
      .trim()
      .split(/\r?\n/)
      .filter((v) => v.trim());
    if (!lines.length) {
      setPasteError("Вставьте хотя бы одну строку");
      return;
    }
    const parsed = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(/\t|;/).map((s) => s.trim());
      if (i === 0 && /фио|фамилия/i.test(cols[0])) continue;
      const [name, birth, grade] = cols;
      const b = parseDate(birth || "");
      const n = Number(grade);
      const d = new Date(b);
      if (
        !name ||
        name.length < 2 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(b) ||
        isNaN(d) ||
        d.toISOString().slice(0, 10) !== b ||
        b > new Date().toISOString().slice(0, 10) ||
        b < "1990-01-01" ||
        grade === "" ||
        !Number.isInteger(n) ||
        n < 0 ||
        n > 12
      ) {
        setPasteError(
          `Строка ${i + 1}: проверьте ФИО, дату рождения (ДД.ММ.ГГГГ) и класс (0–12).`,
        );
        return;
      }
      parsed.push({
        ...makeStudent(event.subjects),
        name,
        birth: b,
        grade: String(n),
      });
    }
    if (!parsed.length) {
      setPasteError("После заголовка добавьте строки с учениками");
      return;
    }
    if (students.filter((s) => s.name.trim()).length + parsed.length > 300) {
      setPasteError("В одной заявке может быть не более 300 учеников");
      return;
    }
    setStudents((s) => [...s.filter((r) => r.name.trim()), ...parsed]);
    setPaste(false);
    setPasteText("");
    setPasteError("");
    notify(`Добавлено учеников: ${parsed.length}`);
  }
  async function submit(e) {
    e.preventDefault();
    if (!consent) {
      setError("Подтвердите согласие на обработку данных");
      return;
    }
    setSending(true);
    setError("");
    try {
      const r = await api("/registrations", {
        method: "POST",
        body: JSON.stringify({
          eventId: id,
          students: students.map(({ key, ...s }) => ({
            ...s,
            name: s.name.trim(),
            grade: Number(s.grade),
          })),
          ...contact,
          teachers: teachers.filter((t) => t.trim()),
          consent,
        }),
      });
      setReceipt(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  if (loadError)
    return (
      <main className="container form-page">
        <ErrorBox>{loadError}</ErrorBox>
        <button className="btn btn-secondary" onClick={load}>
          Повторить
        </button>
        <Link className="text-link" to="/#events">
          Вернуться к афише
        </Link>
      </main>
    );
  if (!event)
    return (
      <main className="container form-page">
        <Spinner />
      </main>
    );
  if (!receipt && event.deadline < new Date().toISOString().slice(0, 10))
    return (
      <main className="container success-page">
        <CalendarDays size={40} style={{ margin: "0 auto 20px" }} />
        <h1>Регистрация завершена</h1>
        <p>
          Приём заявок на олимпиаду в городе {event.city} завершился{" "}
          {dateLabel(event.deadline)}.
        </p>
        <Link
          to="/#events"
          className="btn btn-primary"
          style={{ marginTop: 25 }}
        >
          Выбрать другую олимпиаду <ArrowRight size={18} />
        </Link>
      </main>
    );
  if (receipt)
    return (
      <main className="container success-page">
        <div className="success-icon">
          <CheckCheck size={38} />
        </div>
        <span className="eyebrow">ПЕРВЫЙ ШАГ К БОЛЬШИМ ОТКРЫТИЯМ</span>
        <h1>Ваша команда в списке!</h1>
        <p>
          Заявка сохранена. Организатор свяжется с вами
          <br />
          по указанным контактам для подтверждения деталей.
        </p>
        <div className="receipt-card">
          <span className="muted">Номер заявки</span>
          <strong>{receipt.id}</strong>
          <div>
            <span>
              {event.flag} {event.city} · {dateLabel(event.date)}
            </span>
            <span>
              {receipt.count} учеников · {contact.center}
            </span>
          </div>
        </div>
        <div className="success-buttons">
          <button
            className="btn btn-primary"
            onClick={() =>
              download(
                receipt.id + ".txt",
                `IQ LAND\nЗаявка: ${receipt.id}\n${event.city}, ${dateLabel(event.date)}\nЦентр: ${contact.center}\nУчитель: ${contact.teacher}\nУчеников: ${receipt.count}\n\nСтатус: получена, ожидает подтверждения организатором.`,
              )
            }
          >
            Сохранить номер заявки <Download size={18} />
          </button>
          <Link className="btn btn-secondary" to="/">
            На главную <ArrowUpRight size={18} />
          </Link>
        </div>
        <p className="small muted">
          Сохраните номер заявки — он пригодится при обращении к организатору.
          <br />
          Подтверждение участия и оплата согласовываются отдельно.
        </p>
      </main>
    );
  return (
    <main className="container form-page">
      <Link className="back-link" to="/#events">
        <ArrowLeft size={16} /> Все олимпиады
      </Link>
      <div className="form-title">
        <span className="eyebrow">
          <span /> СОБИРАЕМ КОМАНДУ
        </span>
        <h1>
          Большие открытия — <span className="serif-text">вместе.</span>
        </h1>
        <p>Одна форма для всех учеников вашего центра.</p>
      </div>
      <div className="registration-layout">
        <div className="registration-main">
          <div className="wizard-steps">
            {["Ученики", "Центр и учителя", "Проверка заявки"].map((t, i) => (
              <button
                key={t}
                className={
                  step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
                }
                disabled={i + 1 > step}
                onClick={() => {
                  setStep(i + 1);
                  setError("");
                }}
              >
                <span>{step > i + 1 ? <Check size={15} /> : i + 1}</span>
                {t}
              </button>
            ))}
          </div>
          <form ref={formRef} onSubmit={step === 3 ? submit : next}>
            {step === 1 && (
              <section className="form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Кто едет за новыми знаниями?</h2>
                    <p>Добавьте учеников и выберите дисциплины.</p>
                  </div>
                  <span className="count-badge">
                    <Users size={15} />
                    {students.length}
                  </span>
                </div>
                <div className="table-toolbar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => setPaste(true)}
                  >
                    <ClipboardPaste size={16} /> Вставить список
                  </button>
                  <button
                    type="button"
                    className="text-link small"
                    onClick={() =>
                      download(
                        "IQ-LAND-шаблон.csv",
                        "\uFEFFФИО;Дата рождения;Класс\nИванов Иван;15.03.2015;5\n",
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    <Download size={15} /> Шаблон Excel
                  </button>
                </div>
                <div className="student-table-wrap">
                  <table className="student-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>ФИО ученика</th>
                        <th>Дата рождения</th>
                        <th>Класс</th>
                        <th>Дисциплины</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => (
                        <tr key={s.key}>
                          <td className="row-number">{i + 1}</td>
                          <td>
                            <input
                              aria-label={`ФИО ученика ${i + 1}`}
                              autoComplete="off"
                              placeholder="Фамилия Имя"
                              value={s.name}
                              onChange={(e) =>
                                updateStudent(s.key, "name", e.target.value)
                              }
                              maxLength={150}
                              minLength={2}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              aria-label={`Дата рождения ученика ${i + 1}`}
                              value={s.birth}
                              min="1990-01-01"
                              max={new Date().toISOString().slice(0, 10)}
                              onChange={(e) =>
                                updateStudent(s.key, "birth", e.target.value)
                              }
                              required
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Класс ученика ${i + 1}`}
                              value={s.grade}
                              onChange={(e) =>
                                updateStudent(s.key, "grade", e.target.value)
                              }
                              required
                            >
                              <option value="">—</option>
                              {Array.from({ length: 13 }, (_, i) => (
                                <option key={i} value={i}>
                                  {i === 0 ? "Дошк." : i}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="row-subjects">
                              {event.subjects.map((v) => (
                                <label key={v}>
                                  <input
                                    type="checkbox"
                                    checked={s.subjects.includes(v)}
                                    onChange={(e) =>
                                      updateStudent(
                                        s.key,
                                        "subjects",
                                        e.target.checked
                                          ? [...s.subjects, v]
                                          : s.subjects.filter((x) => x !== v),
                                      )
                                    }
                                  />
                                  <span>{v}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="icon-btn delete-btn"
                              aria-label={`Удалить ученика ${i + 1}`}
                              onClick={() =>
                                setStudents((v) =>
                                  v.filter((r) => r.key !== s.key),
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  disabled={students.length >= 300}
                  className="add-row"
                  onClick={() =>
                    setStudents((s) => [...s, makeStudent(event.subjects)])
                  }
                >
                  <Plus size={18} /> Добавить ученика
                </button>
                <div className="form-tip">
                  <ClipboardPaste size={16} />
                  <span>
                    Список уже в Excel? Скопируйте столбцы «ФИО», «Дата
                    рождения» и «Класс» и вставьте их одним действием.
                  </span>
                </div>
              </section>
            )}
            {step === 2 && (
              <section className="form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Расскажите о вашей команде</h2>
                    <p>Эти контакты нужны организатору для связи с вами.</p>
                  </div>
                </div>
                <div className="fields-grid">
                  {[
                    [
                      "center",
                      "Образовательный центр",
                      "Например, центр «Зерде»",
                    ],
                    ["city", "Город центра", "Например, Алматы"],
                    [
                      "teacher",
                      "ФИО ответственного учителя",
                      "Фамилия Имя Отчество",
                    ],
                    ["phone", "Контактный телефон", "+7 (700) 000-00-00"],
                    ["email", "Email", "teacher@example.kz"],
                  ].map(([key, label, placeholder]) => (
                    <label
                      key={key}
                      className={
                        "field " + (key === "teacher" ? "span-two" : "")
                      }
                    >
                      <span>
                        {label} <b>*</b>
                      </span>
                      <input
                        type={
                          key === "email"
                            ? "email"
                            : key === "phone"
                              ? "tel"
                              : "text"
                        }
                        placeholder={placeholder}
                        value={contact[key]}
                        maxLength={150}
                        minLength={key === "phone" ? 7 : 2}
                        pattern={
                          key === "phone"
                            ? "\\+?[0-9\\s\\(\\)\\-]{7,25}"
                            : undefined
                        }
                        onChange={(e) =>
                          setContact((c) => ({ ...c, [key]: e.target.value }))
                        }
                        required
                      />
                    </label>
                  ))}
                </div>
                <div className="teachers-form-block">
                  <GraduationCap size={23} />
                  <div>
                    <h3>Благодарственные сертификаты</h3>
                    <p>
                      Добавьте педагогов, которым нужно подготовить сертификат.
                      Ответственный учитель уже включён.
                    </p>
                  </div>
                </div>
                {teachers.map((t, i) => (
                  <div className="extra-teacher" key={i}>
                    <input
                      aria-label={`ФИО дополнительного учителя ${i + 1}`}
                      placeholder="ФИО педагога полностью"
                      value={t}
                      minLength={2}
                      maxLength={150}
                      required
                      onChange={(e) =>
                        setTeachers((ts) =>
                          ts.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn delete-btn"
                      aria-label={`Удалить учителя ${i + 1}`}
                      onClick={() =>
                        setTeachers((ts) => ts.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setTeachers((t) => [...t, ""])}
                  disabled={teachers.length >= 30}
                >
                  <Plus size={18} /> Добавить педагога
                </button>
                <label className="field note-field">
                  <span>
                    Комментарий для организатора <small>Необязательно</small>
                  </span>
                  <textarea
                    placeholder="Что ещё нам нужно знать?"
                    rows={3}
                    maxLength={2000}
                    value={contact.note}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, note: e.target.value }))
                    }
                  />
                </label>
              </section>
            )}
            {step === 3 && (
              <section className="form-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Всё готово к отправке?</h2>
                    <p>Проверьте имена — они будут использованы в протоколе.</p>
                  </div>
                  <ShieldCheck size={28} />
                </div>
                <div className="review-contact">
                  <div>
                    <small>Образовательный центр</small>
                    <strong>{contact.center}</strong>
                    <span>{contact.city}</span>
                  </div>
                  <button
                    className="text-link small"
                    type="button"
                    onClick={() => setStep(2)}
                  >
                    Изменить
                  </button>
                </div>
                <div className="review-grid">
                  <div>
                    <small>Ответственный учитель</small>
                    <strong>{contact.teacher}</strong>
                  </div>
                  <div>
                    <small>Контакты</small>
                    <strong>{contact.phone}</strong>
                    <span>{contact.email}</span>
                  </div>
                </div>
                <div className="review-table-title">
                  <h3>
                    Ученики <span className="muted">· {students.length}</span>
                  </h3>
                  <button
                    type="button"
                    className="text-link small"
                    onClick={() => setStep(1)}
                  >
                    Изменить
                  </button>
                </div>
                <div className="review-list">
                  {students.map((s, i) => (
                    <div key={s.key}>
                      <span className="row-number">{i + 1}</span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.grade === "0" ? "Дошкольник" : s.grade + " класс"}{" "}
                          · {s.birth.split("-").reverse().join(".")}
                        </small>
                      </div>
                      <span>{s.subjects.join(", ")}</span>
                    </div>
                  ))}
                </div>
                {teachers.length > 0 && (
                  <p className="small">
                    <strong>Сертификаты педагогам:</strong>{" "}
                    {teachers.join(", ")}
                  </p>
                )}
                {contact.note && (
                  <p className="small">
                    <strong>Комментарий:</strong> {contact.note}
                  </p>
                )}
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                  />
                  <span>
                    Я подтверждаю корректность данных и наличие согласий
                    законных представителей учеников и педагогов на обработку
                    данных для участия в олимпиаде.{" "}
                    <Link to="/privacy" target="_blank">
                      Условия обработки данных
                    </Link>
                  </span>
                </label>
              </section>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <div className="form-navigation">
              {step > 1 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sending}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={17} /> Назад
                </button>
              ) : (
                <span className="small muted">
                  Шаг 1 из 3 · Начнём с учеников
                </span>
              )}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={sending}
              >
                {sending
                  ? "Отправляем…"
                  : step === 3
                    ? "Отправить заявку"
                    : "Продолжить"}
                {step === 3 ? <Check size={18} /> : <ArrowRight size={18} />}
              </button>
            </div>
          </form>
        </div>
        <aside className="registration-aside">
          <div className="event-summary">
            <img src={event.image} alt={event.city} />
            <div>
              <span className="eyebrow">ВАША ОЛИМПИАДА</span>
              <h3>
                {event.flag} {event.city}
              </h3>
              <p>{event.country}</p>
              <ul className="check-list summary-details">
                <li>
                  <CalendarDays size={17} />
                  {dateLabel(event.date)}
                </li>
                {event.subjects.map((s) => (
                  <li key={s}>
                    <GraduationCap size={17} />
                    {s}
                  </li>
                ))}
              </ul>
              <div className="summary-program">
                <h4>В программе</h4>
                {event.includes.map((s) => (
                  <span key={s}>
                    <Check size={14} />
                    {s}
                  </span>
                ))}
              </div>
              <strong className="summary-price">{priceLabel(event)}</strong>
              <p className="small muted">
                Детали и стоимость организатор подтвердит после получения
                заявки.
              </p>
            </div>
          </div>
          <div className="data-assurance">
            <ShieldCheck size={20} />
            <p>Данные команды доступны только организаторам олимпиады.</p>
          </div>
        </aside>
      </div>
      {paste && (
        <Modal
          title="Вставить список учеников"
          onClose={() => setPaste(false)}
          wide
        >
          <p>
            Скопируйте из Excel три столбца:{" "}
            <strong>ФИО · Дата рождения · Класс</strong>. Одна строка — один
            ученик. Для дошкольников укажите класс 0.
          </p>
          <div className="paste-example">
            Иванов Иван &nbsp; 15.03.2015 &nbsp; 5<br />
            Ахметова Алия &nbsp; 22.07.2016 &nbsp; 4
          </div>
          <label className="field">
            <span>Список учеников</span>
            <textarea
              autoFocus
              rows={8}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPasteError("");
              }}
              placeholder={
                "Иванов Иван\t15.03.2015\t5\nАхметова Алия\t22.07.2016\t4"
              }
            />
          </label>
          <p className="small muted">
            Принимаются столбцы, разделённые табуляцией или точкой с запятой.
            Дисциплину можно изменить после добавления.
          </p>
          {pasteError && <ErrorBox>{pasteError}</ErrorBox>}
          <button
            className="btn btn-primary full-width"
            onClick={importStudents}
          >
            Добавить учеников <Plus size={18} />
          </button>
        </Modal>
      )}
    </main>
  );
}
