import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  Save,
  ShieldCheck,
  Trash2,
  Users,
  AlertCircle,
  FileCheck2,
  ChevronDown,
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
import {
  makeStudent,
  validateStudent,
  parseStudentList,
  rosterStats,
  findDuplicates,
  validateContact,
  sanitizeDraft,
} from "../lib/registration";
import "./Registration.css";

const emptyContact = () => ({
  center: "",
  city: "",
  teacher: "",
  email: "",
  phone: "",
  note: "",
});
const steps = [
  { title: "Ученики", hint: "Состав команды" },
  { title: "Центр и учителя", hint: "Контакты и сертификаты" },
  { title: "Проверка заявки", hint: "Всё ли верно?" },
];
const draftKey = (id) => `iqland:team-draft:${id}`;
const receiptKey = (id) => `iqland:pending-receipt:${id}`;
function readPendingReceipt(event) {
  try {
    const raw = sessionStorage.getItem(receiptKey(event.id));
    sessionStorage.removeItem(receiptKey(event.id));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const restored = sanitizeDraft(saved?.draft, event.subjects);
    const receipt = saved?.receipt;
    if (
      !restored ||
      typeof receipt?.id !== "string" ||
      !/^IQ-/.test(receipt.id) ||
      receipt.id.length > 80 ||
      !Number.isInteger(receipt.count) ||
      receipt.count < 1 ||
      receipt.count > 300
    )
      return null;
    return {
      draft: restored,
      receipt: { id: receipt.id, count: receipt.count },
    };
  } catch {
    return null;
  }
}
const yesterday = () =>
  new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const isOpen = (event) =>
  event.deadline >= new Date().toISOString().slice(0, 10);
const hasRowData = (student, subjects) =>
  Boolean(
    student.name.trim() ||
      student.birth ||
      student.grade !== "" ||
      student.subjects.join("|") !== subjects.slice(0, 1).join("|"),
  );
function download(name, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function scrollToForm(ref) {
  requestAnimationFrame(() =>
    ref.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    }),
  );
}

export default function Registration() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const [events, setEvents] = useState([]),
    [event, setEvent] = useState(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(1),
    [visited, setVisited] = useState(1),
    [students, setStudents] = useState([]),
    [contact, setContact] = useState(emptyContact),
    [teachers, setTeachers] = useState([]);
  const [defaults, setDefaults] = useState({ grade: "", subjects: [] }),
    [studentErrors, setStudentErrors] = useState({}),
    [contactErrors, setContactErrors] = useState({}),
    [error, setError] = useState("");
  const [consent, setConsent] = useState(false),
    [sending, setSending] = useState(false),
    [receipt, setReceipt] = useState(null),
    [picker, setPicker] = useState(false),
    [paste, setPaste] = useState(false),
    [pasteText, setPasteText] = useState(""),
    [importErrors, setImportErrors] = useState([]);
  const [query, setQuery] = useState(""),
    [draft, setDraft] = useState(null),
    [leaveTo, setLeaveTo] = useState(null);
  const formRef = useRef(null),
    busyRef = useRef(false),
    routeGeneration = useRef(0),
    mounted = useRef(false),
    transfer = useRef(null),
    liveState = useRef(null);
  liveState.current = { id, event, students, contact, teachers };

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    routeGeneration.current += 1;
    setLoading(true);
    setLoadError("");
    Promise.all([
      api("/events"),
      id ? api("/events/" + id) : Promise.resolve(null),
    ])
      .then(([list, selected]) => {
        if (cancelled) return;
        setEvents(list);
        setEvent(selected);
        setStep(1);
        setVisited(1);
        setConsent(false);
        setReceipt(null);
        setError("");
        setStudentErrors({});
        setContactErrors({});
        setQuery("");
        setPaste(false);
        setPicker(false);
        setPasteText("");
        setImportErrors([]);
        const carried =
          transfer.current?.target === id ? transfer.current : null;
        transfer.current = null;
        if (selected) {
          const completed = readPendingReceipt(selected);
          setDefaults({
            grade: carried?.defaults.grade || "",
            subjects: selected.subjects.slice(0, 1),
          });
          setStudents(
            completed
              ? completed.draft.students
              : carried
                ? carried.students.map((s) => ({
                    ...s,
                    subjects: s.subjects.some((v) =>
                      selected.subjects.includes(v),
                    )
                      ? s.subjects.filter((v) => selected.subjects.includes(v))
                      : selected.subjects.slice(0, 1),
                  }))
                : [makeStudent(selected.subjects)],
          );
          setContact(
            completed?.draft.contact || carried?.contact || emptyContact(),
          );
          setTeachers(completed?.draft.teachers || carried?.teachers || []);
          setReceipt(completed?.receipt || null);
          try {
            setDraft(
              completed
                ? null
                : sanitizeDraft(
                    JSON.parse(sessionStorage.getItem(draftKey(id)) || "null"),
                    selected.subjects,
                  ),
            );
          } catch {
            setDraft(null);
          }
          if (carried && !completed)
            notify("Команда сохранена. Проверьте дисциплины новой олимпиады.");
        } else {
          setStudents([]);
          setContact(emptyContact());
          setTeachers([]);
          setDraft(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      routeGeneration.current += 1;
    };
  }, [id]);

  const subjects = event?.subjects || [];
  const dirty =
    !receipt &&
    Boolean(
      students.some((s) => hasRowData(s, subjects)) ||
        Object.values(contact).some((v) => v.trim()) ||
        teachers.length,
    );
  useEffect(() => {
    if (!dirty) return;
    const unload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const intercept = (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const link = e.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname + url.search ===
          window.location.pathname + window.location.search
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      if (busyRef.current) {
        notify("Заявка отправляется. Дождитесь подтверждения.");
        return;
      }
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    const preserveOnBack = () => {
      const current = liveState.current;
      if (!current?.event) return;
      try {
        sessionStorage.setItem(
          draftKey(current.event.id),
          JSON.stringify({
            version: 1,
            students: current.students.length
              ? current.students
              : [makeStudent(current.event.subjects)],
            contact: current.contact,
            teachers: current.teachers,
            savedAt: new Date().toISOString(),
          }),
        );
      } catch {}
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", preserveOnBack);
    document.addEventListener("click", intercept, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", preserveOnBack);
      document.removeEventListener("click", intercept, true);
    };
  }, [dirty]);

  const stats = useMemo(
    () => rosterStats(students, subjects),
    [students, event],
  );
  const duplicates = useMemo(
    () => new Set(findDuplicates(students)),
    [students],
  );
  const imported = useMemo(
    () => parseStudentList(pasteText, subjects, defaults),
    [pasteText, event, defaults],
  );
  const shownStudents = students
    .map((student, index) => ({ student, index }))
    .filter(
      ({ student }) =>
        !query ||
        student.name
          .toLocaleLowerCase("ru-RU")
          .includes(query.toLocaleLowerCase("ru-RU")),
    );

  function chooseEvent(selected) {
    if (sending) return;
    if (selected.id === id) {
      setPicker(false);
      return;
    }
    transfer.current =
      event && !receipt
        ? { target: selected.id, students, contact, teachers, defaults }
        : null;
    navigate("/events/" + selected.id + "/register");
  }
  function updateStudent(key, field, value) {
    setStudents((list) =>
      list.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
    );
    setStudentErrors((errors) => {
      const next = { ...errors };
      if (next[key]) {
        next[key] = { ...next[key] };
        delete next[key][field];
      }
      return next;
    });
    setError("");
  }
  function addStudents(count = 1) {
    setStudents((list) => [
      ...list,
      ...Array.from({ length: Math.min(count, 300 - list.length) }, () =>
        makeStudent(subjects, defaults),
      ),
    ]);
    setQuery("");
  }
  function applyDefaults() {
    if (!defaults.subjects.length) {
      notify("Выберите дисциплину для команды");
      return;
    }
    setStudents((list) =>
      list.map((s) => ({
        ...s,
        grade: defaults.grade !== "" ? defaults.grade : s.grade,
        subjects: [...defaults.subjects],
      })),
    );
    setStudentErrors({});
    notify("Общие настройки применены ко всем ученикам");
  }
  function copyStudent(student) {
    if (students.length >= 300) return;
    const next = makeStudent(subjects, {
      ...student,
      name: "",
    });
    setStudents((list) => {
      const pos = list.findIndex((s) => s.key === student.key);
      return [...list.slice(0, pos + 1), next, ...list.slice(pos + 1)];
    });
    setQuery("");
  }
  function validateStep(number) {
    setError("");
    if (number === 1) {
      const errors = Object.fromEntries(
        students
          .map((s) => [s.key, validateStudent(s, subjects)])
          .filter(([, errors]) => Object.keys(errors).length),
      );
      setStudentErrors(errors);
      setQuery("");
      if (!students.length || Object.keys(errors).length) {
        setError(
          students.length
            ? "Проверьте отмеченные поля учеников."
            : "Добавьте хотя бы одного ученика.",
        );
        focusError();
        return false;
      }
    } else if (number === 2) {
      const errors = validateContact(contact, teachers);
      setContactErrors(errors);
      if (Object.keys(errors).length) {
        setError("Проверьте контакты центра и имена педагогов.");
        focusError();
        return false;
      }
    }
    return true;
  }
  function focusError() {
    requestAnimationFrame(() => {
      const input = formRef.current?.querySelector('[aria-invalid="true"]');
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
  }
  function goTo(target) {
    if (sending) return;
    if (target > step) {
      for (let n = 1; n < target; n++)
        if (!validateStep(n)) {
          setStep(n);
          return;
        }
    }
    setStep(target);
    setVisited((v) => Math.max(v, target));
    setError("");
    scrollToForm(formRef);
  }
  function next(e) {
    e.preventDefault();
    if (validateStep(step)) goTo(step + 1);
  }
  function saveDraft() {
    if (!event) return false;
    try {
      const saved = {
        version: 1,
        students: students.length ? students : [makeStudent(subjects)],
        contact,
        teachers,
        savedAt: new Date().toISOString(),
      };
      sessionStorage.setItem(draftKey(event.id), JSON.stringify(saved));
      setDraft(saved);
      notify("Черновик сохранён. Он доступен в этой вкладке.");
      return true;
    } catch {
      notify(
        "Не удалось сохранить черновик в браузере. Оставьте вкладку открытой.",
      );
      return false;
    }
  }
  function restoreDraft() {
    if (!draft) return;
    setStudents(draft.students);
    setQuery("");
    setContact({ ...emptyContact(), ...draft.contact });
    setTeachers(draft.teachers);
    setStep(1);
    setVisited(1);
    setStudentErrors({});
    setContactErrors({});
    setConsent(false);
    setError("");
    notify("Черновик восстановлен");
  }
  function removeDraft() {
    try {
      sessionStorage.removeItem(draftKey(event.id));
    } catch {}
    setDraft(null);
  }
  function importStudents() {
    const retained = students.filter((s) => hasRowData(s, subjects));
    if (imported.errors.length) {
      setImportErrors(imported.errors);
      return;
    }
    if (retained.length + imported.students.length > 300) {
      setImportErrors([
        {
          line: 0,
          message: "В одной заявке может быть не более 300 учеников.",
        },
      ]);
      return;
    }
    setStudents([...retained, ...imported.students]);
    setPaste(false);
    setPasteText("");
    setImportErrors([]);
    setQuery("");
    setError("");
    notify(`Добавлено учеников: ${imported.students.length}`);
  }
  async function submit(e) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    if (!consent) {
      setError("Подтвердите согласие на обработку данных.");
      return;
    }
    busyRef.current = true;
    setSending(true);
    setError("");
    const generation = routeGeneration.current;
    const submitted = { event, students, contact, teachers };
    const snapshot = {
      version: 1,
      students: submitted.students,
      contact: submitted.contact,
      teachers: submitted.teachers,
      savedAt: new Date().toISOString(),
    };
    const isCurrent = () =>
      mounted.current &&
      routeGeneration.current === generation &&
      liveState.current?.id === submitted.event.id;
    try {
      const response = await api("/registrations", {
        method: "POST",
        body: JSON.stringify({
          eventId: submitted.event.id,
          students: submitted.students.map(({ key, ...s }) => ({
            ...s,
            name: s.name.trim(),
            grade: Number(s.grade),
          })),
          ...Object.fromEntries(
            Object.entries(submitted.contact).map(([k, v]) => [k, v.trim()]),
          ),
          teachers: submitted.teachers.map((t) => t.trim()),
          consent: true,
        }),
      });
      try {
        sessionStorage.removeItem(draftKey(submitted.event.id));
      } catch {}
      if (!isCurrent()) {
        try {
          sessionStorage.setItem(
            receiptKey(submitted.event.id),
            JSON.stringify({
              receipt: { id: response.id, count: response.count },
              draft: snapshot,
            }),
          );
        } catch {}
        notify(
          `Заявка ${response.id} в городе ${submitted.event.city} получена. Сохраните её номер.`,
        );
        return;
      }
      setReceipt(response);
      setDraft(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      if (!isCurrent()) {
        notify(
          `Заявку в городе ${submitted.event.city} отправить не удалось: ${error.message}`,
        );
        return;
      }
      setError(error.message);
      const rowErrors = {},
        fields = {};
      let requiredStep = 3;
      for (const field of error.fields || []) {
        const match = /^students\.(\d+)\.(\w+)/.exec(field.path);
        if (match && students[Number(match[1])]) {
          const key = students[Number(match[1])].key;
          rowErrors[key] ??= {};
          rowErrors[key][match[2]] = field.message;
          requiredStep = 1;
        } else if (
          field.path in contact ||
          field.path.startsWith("teachers.")
        ) {
          fields[field.path] = field.message;
          requiredStep = Math.min(requiredStep, 2);
        }
      }
      setStudentErrors(rowErrors);
      setContactErrors(fields);
      if (requiredStep < 3) {
        setStep(requiredStep);
        focusError();
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  function EventChoices() {
    return (
      <div className="reg-event-grid">
        {events.filter(isOpen).map((e) => (
          <button
            type="button"
            className="reg-choice"
            key={e.id}
            onClick={() => chooseEvent(e)}
            aria-label={"Выбрать олимпиаду в городе " + e.city}
          >
            <img src={e.image} alt={e.city} />
            <div className="reg-choice-content">
              <span>
                {e.flag} {e.country}
              </span>
              <h2>{e.city}</h2>
              <p>{e.subjects.join(" · ")}</p>
              <div className="reg-choice-details">
                <CalendarDays size={17} />
                {dateLabel(e.date)}
              </div>
              <span className="reg-choice-action">
                Зарегистрировать команду <ArrowUpRight size={20} />
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }
  function FieldError({ message, id }) {
    return message ? (
      <small id={id} className="reg-field-error">
        {message}
      </small>
    ) : null;
  }

  if (loading)
    return (
      <main className="container reg-page">
        <Spinner />
      </main>
    );
  if (loadError)
    return (
      <main className="container reg-page">
        <ErrorBox>{loadError}</ErrorBox>
        <button
          className="btn btn-secondary"
          onClick={() => window.location.reload()}
        >
          Повторить загрузку
        </button>
        <Link className="back-link" to="/#events">
          К афише
        </Link>
      </main>
    );
  if (!event)
    return (
      <main className="container reg-page">
        <header className="reg-heading">
          <span className="eyebrow">
            Для учителей и образовательных центров
          </span>
          <h1>
            Регистрация <span className="accent-text">команды.</span>
          </h1>
          <p>
            Сначала выберите олимпиаду, на которую хотите отправить учеников.
          </p>
        </header>
        {events.some(isOpen) ? (
          <EventChoices />
        ) : (
          <div className="empty-state">
            <CalendarDays size={40} />
            <h2>Новые олимпиады скоро появятся</h2>
            <p>
              Сейчас нет открытых регистраций. Посмотрите афишу и программу
              событий.
            </p>
            <Link className="btn btn-primary" to="/#events">
              Посмотреть афишу <ArrowUpRight size={20} />
            </Link>
          </div>
        )}
      </main>
    );
  if (!receipt && !isOpen(event))
    return (
      <main className="container reg-page reg-success">
        <CalendarDays size={45} />
        <h1>Регистрация завершена</h1>
        <p>
          Приём заявок на олимпиаду в городе {event.city} завершился{" "}
          {dateLabel(event.deadline)}.
        </p>
        <Link className="btn btn-primary" to="/register">
          Выбрать другую олимпиаду <ArrowRight size={20} />
        </Link>
      </main>
    );
  if (receipt)
    return (
      <main className="container reg-page reg-success">
        <div className="reg-success-icon">
          <CheckCheck size={38} />
        </div>
        <span className="eyebrow">Заявка получена</span>
        <h1>Ваша команда в списке!</h1>
        <p>
          Организатор получил данные и свяжется с вами
          <br />
          для подтверждения участия. Детали и оплату согласуете с организатором.
        </p>
        <div className="reg-receipt">
          <span>Номер вашей заявки</span>
          <strong>{receipt.id}</strong>
          <button
            className="text-link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(receipt.id);
                notify("Номер заявки скопирован");
              } catch {
                notify("Сохраните номер заявки из карточки");
              }
            }}
          >
            <Copy size={17} /> Скопировать номер
          </button>
          <div className="reg-receipt-info">
            <div>
              <small>Олимпиада</small>
              <strong>{event.city}</strong>
              <span>{dateLabel(event.date)}</span>
            </div>
            <div>
              <small>Команда</small>
              <strong>{contact.center}</strong>
              <span>
                {receipt.count} учеников · {teachers.length + 1} педагогов
              </span>
            </div>
          </div>
        </div>
        <div className="reg-success-actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              download(
                receipt.id + ".txt",
                `IQ LAND\nНомер заявки: ${receipt.id}\nОлимпиада: ${event.city}, ${dateLabel(event.date)}\nЦентр: ${contact.center}\nУчитель: ${contact.teacher}\nУчеников: ${receipt.count}\nСтатус: получена, ожидает подтверждения организатором.`,
              )
            }
          >
            Скачать подтверждение <Download size={18} />
          </button>
          <Link className="btn btn-secondary" to="/#events">
            Вернуться к олимпиадам <ArrowUpRight size={18} />
          </Link>
        </div>
        <p className="small muted">
          Сохраните номер заявки — он пригодится при обращении к организатору.
        </p>
      </main>
    );

  return (
    <main className="container reg-page">
      <Link className="back-link" to="/#events">
        <ArrowLeft size={17} /> Все олимпиады
      </Link>
      <header className="reg-heading">
        <span className="eyebrow">
          Участвует команда. Регистрирует учитель.
        </span>
        <h1>
          Регистрация <span className="accent-text">команды.</span>
        </h1>
        <p>
          Одна заявка на всех учеников. Добавьте состав, расскажите о центре — и
          можно отправлять.
        </p>
      </header>
      <section className="reg-event-banner" aria-label="Выбранная олимпиада">
        <img src={event.image} alt={event.city} />
        <div className="reg-event-content">
          <span className="eyebrow">Выбранная олимпиада</span>
          <h2>
            {event.city}
            <span>{event.flag}</span>
          </h2>
          <div className="reg-event-meta">
            <span>
              <MapPin size={16} />
              {event.country}
            </span>
            <span>
              <CalendarDays size={16} />
              {dateLabel(event.date)}
            </span>
          </div>
        </div>
        <div className="reg-event-side">
          <strong>{priceLabel(event)}</strong>
          <small>Заявки до {dateLabel(event.deadline)}</small>
          <button
            className="text-link"
            type="button"
            disabled={sending}
            onClick={() => setPicker(true)}
          >
            Сменить олимпиаду <ChevronDown size={16} />
          </button>
        </div>
      </section>
      <div className="reg-layout">
        <div className="reg-main">
          <nav className="reg-steps" aria-label="Шаги регистрации">
            {steps.map((s, i) => (
              <button
                type="button"
                key={s.title}
                disabled={sending || i + 1 > visited}
                className={
                  step === i + 1 ? "is-current" : i + 1 < step ? "is-done" : ""
                }
                aria-current={step === i + 1 ? "step" : undefined}
                onClick={() => goTo(i + 1)}
              >
                <span className="reg-step-number">
                  {step > i + 1 ? <Check size={17} /> : i + 1}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.hint}</small>
                </div>
              </button>
            ))}
          </nav>
          {draft && (
            <div className="reg-draft-bar">
              <div>
                <Save size={19} />
                <span>
                  Есть сохранённый черновик
                  {draft.savedAt
                    ? " от " +
                      new Date(draft.savedAt).toLocaleString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
              </div>
              <div className="reg-draft-actions">
                <button
                  type="button"
                  className="text-link"
                  disabled={sending}
                  onClick={restoreDraft}
                >
                  Восстановить
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Удалить черновик"
                  disabled={sending}
                  onClick={removeDraft}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
          <form ref={formRef} onSubmit={step === 3 ? submit : next} noValidate>
            {step === 1 && (
              <section className="reg-form-card">
                <div className="reg-panel-head">
                  <div>
                    <span className="eyebrow">Шаг 1 из 3</span>
                    <h2>Ученики команды</h2>
                    <p>
                      Введите данные вручную или вставьте весь список за один
                      раз.
                    </p>
                  </div>
                  <span className="reg-count-badge">
                    <Users size={18} />
                    {students.length}
                  </span>
                </div>
                <div className="reg-tools">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      setPaste(true);
                      setImportErrors([]);
                    }}
                  >
                    <ClipboardPaste size={18} /> Вставить список
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      download(
                        "IQ-LAND-шаблон.csv",
                        `\uFEFFФИО;Дата рождения;Класс;Дисциплины\nИванов Иван;15.03.2015;5;${subjects[0]}\n`,
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    <Download size={17} /> Шаблон Excel
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={!dirty}
                    onClick={saveDraft}
                  >
                    <Save size={17} /> Сохранить черновик
                  </button>
                </div>
                <details className="reg-bulk-disclosure">
                  <summary>
                    Общие настройки команды
                    <span>Класс и дисциплины для всех</span>
                    <ChevronDown size={18} />
                  </summary>
                  <div className="reg-bulk-settings">
                    <label className="reg-default-grade">
                      <span>Класс для новых учеников</span>
                      <select
                        aria-label="Класс для новых учеников"
                        value={defaults.grade}
                        onChange={(e) =>
                          setDefaults((v) => ({ ...v, grade: e.target.value }))
                        }
                      >
                        <option value="">Выбрать класс</option>
                        {Array.from({ length: 13 }, (_, i) => (
                          <option value={i} key={i}>
                            {i === 0 ? "Дошкольники" : i + " класс"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="reg-bulk-subjects">
                      <legend>Дисциплины для новых учеников</legend>
                      <div className="reg-subject-options">
                        {subjects.map((s) => (
                          <label
                            className={
                              defaults.subjects.includes(s) ? "is-selected" : ""
                            }
                            key={s}
                          >
                            <input
                              type="checkbox"
                              checked={defaults.subjects.includes(s)}
                              onChange={(e) =>
                                setDefaults((v) => ({
                                  ...v,
                                  subjects: e.target.checked
                                    ? [...v.subjects, s]
                                    : v.subjects.filter((x) => x !== s),
                                }))
                              }
                            />
                            <span>{s}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button
                      type="button"
                      className="text-link"
                      disabled={!students.length || !defaults.subjects.length}
                      onClick={applyDefaults}
                    >
                      Применить ко всем <ArrowRight size={17} />
                    </button>
                  </div>
                </details>
                {(students.length > 4 || query) && (
                  <label className="field reg-roster-search">
                    <span>Найти ученика в списке</span>
                    <input
                      type="search"
                      placeholder="Имя или фамилия"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
                <div className="reg-student-scroll">
                  <table className="reg-students">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>ФИО ученика</th>
                        <th>Дата рождения</th>
                        <th>Класс</th>
                        <th>Дисциплины</th>
                        <th>
                          <span className="reg-sr-only">Действия</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownStudents.map(({ student: s, index: i }) => {
                        const errors = studentErrors[s.key] || {};
                        return (
                          <tr
                            key={s.key}
                            className={
                              Object.keys(errors).length
                                ? "reg-student-row has-error"
                                : "reg-student-row"
                            }
                          >
                            <td className="reg-row-number">{i + 1}</td>
                            <td data-label="ФИО ученика">
                              <input
                                aria-label={`ФИО ученика ${i + 1}`}
                                aria-invalid={Boolean(errors.name)}
                                aria-describedby={
                                  errors.name ? s.key + "-name" : undefined
                                }
                                autoComplete="off"
                                placeholder="Фамилия Имя"
                                value={s.name}
                                onChange={(e) =>
                                  updateStudent(s.key, "name", e.target.value)
                                }
                                maxLength={150}
                              />
                              <FieldError
                                id={s.key + "-name"}
                                message={errors.name}
                              />
                              {duplicates.has(s.key) && (
                                <small className="reg-duplicate-note">
                                  <AlertCircle size={13} /> Имя и дата
                                  повторяются — проверьте строку
                                </small>
                              )}
                            </td>
                            <td data-label="Дата рождения">
                              <input
                                type="date"
                                aria-label={`Дата рождения ученика ${i + 1}`}
                                aria-invalid={Boolean(errors.birth)}
                                aria-describedby={
                                  errors.birth ? s.key + "-birth" : undefined
                                }
                                min="1990-01-01"
                                max={yesterday()}
                                value={s.birth}
                                onChange={(e) =>
                                  updateStudent(s.key, "birth", e.target.value)
                                }
                              />
                              <FieldError
                                id={s.key + "-birth"}
                                message={errors.birth}
                              />
                            </td>
                            <td data-label="Класс">
                              <select
                                aria-label={`Класс ученика ${i + 1}`}
                                aria-invalid={Boolean(errors.grade)}
                                aria-describedby={
                                  errors.grade ? s.key + "-grade" : undefined
                                }
                                value={s.grade}
                                onChange={(e) =>
                                  updateStudent(s.key, "grade", e.target.value)
                                }
                              >
                                <option value="">—</option>
                                {Array.from({ length: 13 }, (_, n) => (
                                  <option value={n} key={n}>
                                    {n === 0 ? "Дошк." : n}
                                  </option>
                                ))}
                              </select>
                              <FieldError
                                id={s.key + "-grade"}
                                message={errors.grade}
                              />
                            </td>
                            <td data-label="Дисциплины">
                              <div className="reg-subject-options">
                                {subjects.map((v) => (
                                  <label
                                    className={
                                      s.subjects.includes(v)
                                        ? "is-selected"
                                        : ""
                                    }
                                    key={v}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={s.subjects.includes(v)}
                                      aria-invalid={Boolean(errors.subjects)}
                                      aria-describedby={
                                        errors.subjects
                                          ? s.key + "-subjects"
                                          : undefined
                                      }
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
                              <FieldError
                                id={s.key + "-subjects"}
                                message={errors.subjects}
                              />
                            </td>
                            <td>
                              <div className="reg-row-actions">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label={`Добавить похожего ученика ${i + 1}`}
                                  title="Добавить ученика с такими же датой, классом и дисциплинами"
                                  disabled={students.length >= 300}
                                  onClick={() => copyStudent(s)}
                                >
                                  <Copy size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn delete-btn"
                                  aria-label={`Удалить ученика ${i + 1}`}
                                  onClick={() => {
                                    setStudents((list) =>
                                      list.filter((v) => v.key !== s.key),
                                    );
                                    setStudentErrors((errors) => {
                                      const next = { ...errors };
                                      delete next[s.key];
                                      return next;
                                    });
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {query && !shownStudents.length && (
                  <p className="reg-hint">
                    Такого ученика нет в списке. Измените поиск.
                  </p>
                )}
                {!students.length && (
                  <div className="empty-state">
                    <Users size={34} />
                    <h3>Начнём с первого ученика</h3>
                    <p>Добавьте строку или вставьте список из Excel.</p>
                  </div>
                )}
                <div className="reg-add-students">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={students.length >= 300}
                    onClick={() => addStudents()}
                  >
                    <Plus size={19} /> Добавить ученика
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={students.length >= 300}
                    onClick={() => addStudents(5)}
                  >
                    Добавить 5 строк
                  </button>
                  <span>{students.length} из 300</span>
                </div>
                <p className="reg-hint">
                  <ShieldCheck size={17} /> Имена нужны для протокола и
                  сертификатов. Проверьте написание перед отправкой.
                </p>
              </section>
            )}
            {step === 2 && (
              <section className="reg-form-card">
                <div className="reg-panel-head">
                  <div>
                    <span className="eyebrow">Шаг 2 из 3</span>
                    <h2>Центр и учителя</h2>
                    <p>
                      Кому сообщить детали участия и подготовить
                      благодарственные сертификаты?
                    </p>
                  </div>
                </div>
                <div className="fields-grid reg-fields">
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
                      className={
                        "field " + (key === "teacher" ? "span-two" : "")
                      }
                      key={key}
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
                        autoComplete={
                          key === "teacher"
                            ? "name"
                            : key === "email"
                              ? "email"
                              : key === "phone"
                                ? "tel"
                                : key === "center"
                                  ? "organization"
                                  : "address-level2"
                        }
                        aria-invalid={Boolean(contactErrors[key])}
                        aria-describedby={
                          contactErrors[key] ? "contact-" + key : undefined
                        }
                        maxLength={
                          key === "phone" ? 25 : key === "email" ? 200 : 150
                        }
                        placeholder={placeholder}
                        value={contact[key]}
                        onChange={(e) => {
                          setContact((v) => ({ ...v, [key]: e.target.value }));
                          setContactErrors((v) => ({ ...v, [key]: undefined }));
                          setError("");
                        }}
                      />
                      <FieldError
                        id={"contact-" + key}
                        message={contactErrors[key]}
                      />
                    </label>
                  ))}
                </div>
                <div className="reg-section-heading">
                  <GraduationCap size={26} />
                  <div>
                    <h3>Благодарственные сертификаты</h3>
                    <p>
                      Ответственный учитель уже включён. Добавьте остальных
                      педагогов, которым нужен сертификат.
                    </p>
                  </div>
                </div>
                {teachers.map((teacher, i) => (
                  <div key={i} className="reg-teacher-row">
                    <label className="field">
                      <span>ФИО педагога {i + 1}</span>
                      <input
                        aria-label={`ФИО дополнительного учителя ${i + 1}`}
                        maxLength={150}
                        placeholder="Фамилия Имя Отчество"
                        value={teacher}
                        aria-invalid={Boolean(contactErrors["teachers." + i])}
                        aria-describedby={
                          contactErrors["teachers." + i]
                            ? "teacher-" + i
                            : undefined
                        }
                        onChange={(e) => {
                          setTeachers((list) =>
                            list.map((v, index) =>
                              index === i ? e.target.value : v,
                            ),
                          );
                          setContactErrors((v) => ({
                            ...v,
                            ["teachers." + i]: undefined,
                          }));
                        }}
                      />
                      <FieldError
                        id={"teacher-" + i}
                        message={contactErrors["teachers." + i]}
                      />
                    </label>
                    <button
                      className="icon-btn delete-btn"
                      type="button"
                      aria-label={`Удалить учителя ${i + 1}`}
                      onClick={() => {
                        setTeachers((list) =>
                          list.filter((_, index) => index !== i),
                        );
                        setContactErrors((errors) =>
                          Object.fromEntries(
                            Object.entries(errors).filter(
                              ([key]) => !key.startsWith("teachers"),
                            ),
                          ),
                        );
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-link"
                  type="button"
                  disabled={teachers.length >= 30}
                  onClick={() => setTeachers((list) => [...list, ""])}
                >
                  <Plus size={19} /> Добавить педагога
                </button>
                <label className="field reg-note-field">
                  <span>
                    Комментарий для организатора <small>Необязательно</small>
                  </span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Например, особые пожелания по программе поездки"
                    value={contact.note}
                    onChange={(e) =>
                      setContact((v) => ({ ...v, note: e.target.value }))
                    }
                  />
                  <FieldError id="contact-note" message={contactErrors.note} />
                </label>
                <button className="text-link" type="button" onClick={saveDraft}>
                  <Save size={17} /> Сохранить черновик
                </button>
              </section>
            )}
            {step === 3 && (
              <section className="reg-form-card">
                <div className="reg-panel-head">
                  <div>
                    <span className="eyebrow">Шаг 3 из 3</span>
                    <h2>Проверьте заявку</h2>
                    <p>
                      Проверьте имена учеников и контакты. После отправки заявку
                      увидит организатор.
                    </p>
                  </div>
                  <FileCheck2 size={28} />
                </div>
                <div className="reg-review-heading">
                  <h3>{contact.center}</h3>
                  <button
                    className="text-link"
                    type="button"
                    disabled={sending}
                    onClick={() => goTo(2)}
                  >
                    Изменить контакты
                  </button>
                </div>
                <div className="reg-review-grid">
                  <div>
                    <small>Город центра</small>
                    <strong>{contact.city}</strong>
                  </div>
                  <div>
                    <small>Ответственный учитель</small>
                    <strong>{contact.teacher}</strong>
                  </div>
                  <div>
                    <small>Телефон</small>
                    <strong>{contact.phone}</strong>
                  </div>
                  <div>
                    <small>Email</small>
                    <strong>{contact.email}</strong>
                  </div>
                </div>
                <div className="reg-review-heading">
                  <h3>Ученики · {students.length}</h3>
                  <button
                    className="text-link"
                    type="button"
                    disabled={sending}
                    onClick={() => goTo(1)}
                  >
                    Изменить состав
                  </button>
                </div>
                <div className="reg-review-students">
                  {students.map((s, i) => (
                    <div key={s.key}>
                      <span>{i + 1}</span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {Number(s.grade) === 0
                            ? "Дошкольник"
                            : s.grade + " класс"}{" "}
                          · {s.birth.split("-").reverse().join(".")}
                        </small>
                      </div>
                      <span>{s.subjects.join(", ")}</span>
                    </div>
                  ))}
                </div>
                {teachers.length > 0 && (
                  <div className="reg-review-note">
                    <small>Дополнительные сертификаты педагогам</small>
                    <p>{teachers.join(", ")}</p>
                  </div>
                )}
                {contact.note && (
                  <div className="reg-review-note">
                    <small>Комментарий</small>
                    <p>{contact.note}</p>
                  </div>
                )}
                <label className="reg-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={sending}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    Подтверждаю корректность данных и наличие согласий законных
                    представителей учеников и педагогов на обработку данных для
                    участия в олимпиаде.{" "}
                    <Link to="/privacy" target="_blank">
                      Условия обработки данных
                    </Link>
                  </span>
                </label>
              </section>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <div className="reg-footer-bar">
              <div>
                <strong>
                  {step === 1
                    ? `${stats.ready} из ${stats.total} учеников готовы`
                    : step === 2
                      ? `${students.length} учеников в команде`
                      : "Заявка готова к отправке"}
                </strong>
                <p>
                  {step === 1
                    ? stats.issues
                      ? "Заполните данные всех учеников"
                      : "Можно переходить к контактам"
                    : step === 2
                      ? "Контакты нужны для подтверждения участия"
                      : "Организатор свяжется с вами после получения заявки"}
                </p>
              </div>
              <div className="reg-footer-actions">
                {step > 1 && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={sending}
                    onClick={() => goTo(step - 1)}
                  >
                    <ArrowLeft size={18} /> Назад
                  </button>
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
                  {step === 3 ? <Check size={20} /> : <ArrowRight size={20} />}
                </button>
              </div>
            </div>
          </form>
        </div>
        <aside className="reg-aside">
          <div className="reg-summary-card">
            <span className="reg-summary-label">Ваша команда</span>
            <div className="reg-total">
              <strong>{students.length.toString().padStart(2, "0")}</strong>
              <span>
                учеников
                <br />в одной заявке
              </span>
            </div>
            <div className="reg-summary-line">
              <span>Заполнено</span>
              <strong>
                {stats.ready} из {stats.total}
              </strong>
            </div>
            <div className="reg-summary-line">
              <span>Педагогов</span>
              <strong>{teachers.filter((v) => v.trim()).length + 1}</strong>
            </div>
            <div className="reg-subject-count">
              {subjects.map((s) => (
                <div key={s}>
                  <span>{s}</span>
                  <strong>
                    {students.filter((v) => v.subjects.includes(s)).length}
                  </strong>
                </div>
              ))}
            </div>
            <p className="reg-hint">
              Один ученик может участвовать в нескольких дисциплинах.
            </p>
          </div>
          <div className="reg-summary-card">
            <span className="reg-summary-label">В программе</span>
            <ul className="reg-checklist">
              {event.includes.map((s) => (
                <li key={s}>
                  <Check size={17} />
                  {s}
                </li>
              ))}
            </ul>
            <p className="reg-hint">
              Стоимость и детали организатор подтвердит после заявки.
            </p>
          </div>
          <div className="reg-hint">
            <ShieldCheck size={19} />
            <span>
              Заявку заполняет учитель. Отдельные аккаунты учеников не нужны.
            </span>
          </div>
        </aside>
      </div>
      {picker && (
        <Modal title="Выберите олимпиаду" onClose={() => setPicker(false)} wide>
          {dirty && (
            <p>
              Состав команды и контакты сохранятся. Дисциплины нужно будет
              проверить по программе новой олимпиады.
            </p>
          )}
          <EventChoices />
        </Modal>
      )}
      {paste && (
        <Modal
          title="Вставить список учеников"
          onClose={() => setPaste(false)}
          wide
        >
          <p>
            Скопируйте из Excel столбцы{" "}
            <strong>ФИО, дата рождения, класс</strong>. Одна строка — один
            ученик. Четвёртым столбцом можно указать дисциплины через запятую.
          </p>
          <div className="reg-import-help">
            <span>Пример</span>
            <code>
              Иванов Иван;15.03.2015;5
              <br />
              Ахметова Алия;22.07.2016;4
            </code>
          </div>
          <label className="field">
            <span>Список учеников</span>
            <textarea
              rows={7}
              aria-label="Список учеников"
              autoFocus
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setImportErrors([]);
              }}
              placeholder={
                "ФИО\tДата рождения\tКласс\nИванов Иван\t15.03.2015\t5"
              }
            />
          </label>
          <p className="small muted">
            Дата: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД. Класс 0 — дошкольник. Заполненные
            строки в вашей команде сохранятся.
          </p>
          {importErrors.length > 0 && (
            <div className="reg-import-errors" role="alert">
              <strong>Исправьте список — пока ничего не добавлено</strong>
              <ul>
                {importErrors.slice(0, 8).map((issue, index) => (
                  <li key={index}>
                    {issue.line ? `Строка ${issue.line}: ` : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
              {importErrors.length > 8 && (
                <p>И ещё ошибок: {importErrors.length - 8}</p>
              )}
            </div>
          )}
          {pasteText.trim() && !imported.errors.length && (
            <p className="reg-import-ready">
              <Check size={17} /> Готово к добавлению:{" "}
              {imported.students.length} учеников
            </p>
          )}
          <button
            className="btn btn-primary full-width"
            type="button"
            onClick={importStudents}
          >
            Добавить учеников <Plus size={19} />
          </button>
        </Modal>
      )}
      {leaveTo && (
        <Modal
          title="Сохранить состав команды?"
          onClose={() => setLeaveTo(null)}
        >
          <p>
            В форме есть заполненные данные. Можно сохранить черновик и
            вернуться к нему в этой вкладке.
          </p>
          <div className="reg-leave-actions">
            <button
              className="btn btn-primary full-width"
              onClick={() => {
                if (saveDraft()) {
                  const target = leaveTo;
                  setLeaveTo(null);
                  navigate(target);
                }
              }}
            >
              Сохранить и выйти <Save size={18} />
            </button>
            <button
              className="btn btn-secondary full-width"
              onClick={() => {
                const target = leaveTo;
                setLeaveTo(null);
                navigate(target);
              }}
            >
              Выйти без сохранения
            </button>
            <button className="text-link" onClick={() => setLeaveTo(null)}>
              Остаться в форме
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
