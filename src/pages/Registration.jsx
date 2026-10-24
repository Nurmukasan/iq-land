import {
  tr,
  getIntlLocale,
  getLanguage,
  dateTimeLabel,
} from "../i18n/runtime.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CONSENT_TEXT, PRIVACY_VERSION, REGISTRATION_PAUSED_MESSAGE } from "../../shared/privacy.js";
import { generalContact } from "../lib/contacts.js";
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
  Send,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  AlertCircle,
  FileCheck2,
  UploadCloud,
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
  rosterStats,
  findDuplicates,
  validateContact,
  sanitizeDraft,
  sameRegistrationAttempt,
} from "../lib/registration";
import { previewRoster, readRosterFile } from "../lib/roster-import.js";
import "./Registration.css";
import { normalizeTelegramUrl } from "../../shared/telegram.js";
import EventPhoto from "../components/EventPhoto";
import EventDocuments from "../components/EventDocuments";
import { sanitizeEventDocuments } from "../../shared/event-documents.js";

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
const attemptKey = (id) => `iqland:submission-attempt:${id}`;
const receiptReadyEvent = "iqland:registration-completed";
const telegramInvite = (value) => normalizeTelegramUrl(value) || "";
function restoreReceipt(saved, event) {
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
    receipt: {
      id: receipt.id,
      count: receipt.count,
      telegramUrl: telegramInvite(receipt.telegramUrl),
      documents: sanitizeEventDocuments(receipt.documents ?? event.documents),
    },
  };
}
function readPendingReceipt(event) {
  try {
    const raw = sessionStorage.getItem(receiptKey(event.id));
    sessionStorage.removeItem(receiptKey(event.id));
    if (!raw) return null;
    return restoreReceipt(JSON.parse(raw), event);
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
  const url = URL.createObjectURL(new Blob([tr(text)], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = tr(name);
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
  const [registrationOpen, setRegistrationOpen] = useState(false);
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
    [pendingCompletion, setPendingCompletion] = useState(null),
    [picker, setPicker] = useState(false),
    [paste, setPaste] = useState(false),
    [pasteText, setPasteText] = useState(""),
    [importErrors, setImportErrors] = useState([]);
  const [query, setQuery] = useState(""),
    [onlyIssues, setOnlyIssues] = useState(false),
    [issueKeys, setIssueKeys] = useState(() => new Set()),
    [autoSave, setAutoSave] = useState(""),
    [draft, setDraft] = useState(null),
    [leaveTo, setLeaveTo] = useState(null);
  const [importBusy, setImportBusy] = useState(false),
    [importFileError, setImportFileError] = useState(""),
    [importSheets, setImportSheets] = useState([]),
    [importSheet, setImportSheet] = useState(0);
  const formRef = useRef(null),
    fileInput = useRef(null),
    importRequest = useRef(0),
    submissionAttempt = useRef(null),
    busyRef = useRef(false),
    routeGeneration = useRef(0),
    mounted = useRef(false),
    transfer = useRef(null),
    liveState = useRef(null);
  liveState.current = { id, event, students, contact, teachers };

  useEffect(() => {
    const receive = ({ detail }) => {
      if (detail?.eventId === liveState.current?.id)
        setPendingCompletion(detail);
    };
    window.addEventListener(receiptReadyEvent, receive);
    return () => window.removeEventListener(receiptReadyEvent, receive);
  }, []);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    routeGeneration.current += 1;
    importRequest.current += 1;
    setImportBusy(false);
    setImportSheets([]);
    setImportFileError("");
    setOnlyIssues(false);
    setAutoSave("");
    setLoading(true);
    setLoadError("");
    Promise.all([
      api("/events"),
      id ? api("/events/" + id) : Promise.resolve(null),
      api("/legal"),
    ])
      .then(([list, selected, legal]) => {
        if (cancelled) return;
        setEvents(list);
        setEvent(selected);
        setRegistrationOpen(legal.registrationOpen === true);
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

  // A completed request may outlive this route or its component instance.
  // Recover after the current event loads as well as when a late response arrives.
  useEffect(() => {
    if (
      !pendingCompletion ||
      event?.id !== id ||
      pendingCompletion.eventId !== id
    )
      return;
    const completed = restoreReceipt(pendingCompletion, event);
    setPendingCompletion(null);
    if (!completed) return;
    try {
      sessionStorage.removeItem(receiptKey(id));
    } catch {}
    setStudents(completed.draft.students);
    setContact(completed.draft.contact);
    setTeachers(completed.draft.teachers);
    setReceipt(completed.receipt);
    setDraft(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pendingCompletion, event, id]);

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
      preserveOnBack();
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

  useEffect(() => {
    if (!dirty || loading || sending || receipt || event?.id !== id) return;
    setAutoSave("saving");
    const snapshot = { version: 1, students: students.length ? students : [makeStudent(subjects)], contact, teachers, savedAt: new Date().toISOString() };
    const timeout = setTimeout(() => {
      try {
        sessionStorage.setItem(draftKey(id), JSON.stringify(snapshot));
        setAutoSave("saved");
        setDraft(null);
      } catch { setAutoSave("failed"); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [students, contact, teachers, id, loading, sending, receipt, event?.id]);

  const stats = useMemo(
    () => rosterStats(students, subjects),
    [students, event],
  );
  const duplicates = useMemo(
    () => new Set(findDuplicates(students)),
    [students],
  );
  const imported = useMemo(
    () => previewRoster(pasteText, subjects, defaults),
    [pasteText, event, defaults],
  );
  const shownStudents = students
    .map((student, index) => ({ student, index }))
    .filter(
      ({ student }) =>
        (!onlyIssues || issueKeys.has(student.key)) && (!query ||
        student.name
          .toLocaleLowerCase("ru-RU")
          .includes(query.toLocaleLowerCase("ru-RU"))),
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
    setOnlyIssues(false);
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
    setOnlyIssues(false);
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
        setOnlyIssues(false);
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
  async function loadRosterFile(file) {
    if (!file || !event) return;
    const request = ++importRequest.current, eventId = event.id;
    setPaste(true);
    setImportBusy(true);
    setImportFileError("");
    setImportErrors([]);
    try {
      const sheets = await readRosterFile(file);
      if (!mounted.current || request !== importRequest.current || liveState.current?.id !== eventId) return;
      setImportSheets(sheets);
      setImportSheet(0);
      setPasteText(sheets[0].text);
    } catch (error) {
      if (mounted.current && request === importRequest.current) setImportFileError(error.message);
    } finally {
      if (mounted.current && request === importRequest.current) setImportBusy(false);
    }
  }
  function closeImport() {
    importRequest.current++;
    setImportBusy(false);
    setPaste(false);
  }
  function importStudents(allowIncomplete = false) {
    const retained = students.filter((s) => s.name.trim() || s.birth.trim());
    if (imported.fatal || (imported.errors.length && !allowIncomplete) || !imported.students.length) {
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
    const added = imported.students.map((s) => ({ ...s, subjects: s.subjects.filter((subject) => subjects.includes(subject)) }));
    setStudents([...retained, ...added]);
    setStudentErrors(allowIncomplete ? Object.fromEntries(added.map((s) => [s.key, validateStudent(s, subjects)])) : {});
    setOnlyIssues(allowIncomplete);
    setIssueKeys(new Set(added.filter((s) => Object.keys(validateStudent(s, subjects)).length).map((s) => s.key)));
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
      const body = JSON.stringify({
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
          privacyVersion: PRIVACY_VERSION,
          consentLanguage: getLanguage(),
        });
      if (!sameRegistrationAttempt(submissionAttempt.current?.body, body)) {
        let previous;
        try { previous = JSON.parse(sessionStorage.getItem(attemptKey(submitted.event.id)) || "null"); } catch {}
        const key = sameRegistrationAttempt(previous?.body, body) && /^[A-Za-z0-9_-]{16,128}$/.test(previous.key || "")
          ? previous.key
          : `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        submissionAttempt.current = { body, key };
        try { sessionStorage.setItem(attemptKey(submitted.event.id), JSON.stringify(submissionAttempt.current)); } catch {}
      }
      const response = await api("/registrations", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": submissionAttempt.current.key },
      });
      try {
        sessionStorage.removeItem(draftKey(submitted.event.id));
        sessionStorage.removeItem(attemptKey(submitted.event.id));
      } catch {}
      if (!isCurrent()) {
        const completion = {
          eventId: submitted.event.id,
          receipt: {
            id: response.id,
            count: response.count,
            telegramUrl: telegramInvite(response.telegramUrl),
            documents: sanitizeEventDocuments(response.documents),
          },
          draft: snapshot,
        };
        try {
          sessionStorage.setItem(
            receiptKey(submitted.event.id),
            JSON.stringify(completion),
          );
        } catch {}
        window.dispatchEvent(
          new CustomEvent(receiptReadyEvent, { detail: completion }),
        );
        notify(
          `Заявка ${response.id} в городе ${submitted.event.city} получена. Сохраните её номер.`,
        );
        return;
      }
      setReceipt({
        ...response,
        telegramUrl: telegramInvite(response.telegramUrl),
      });
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
            aria-label={tr("Выбрать олимпиаду в городе " + e.city)}
          >
            <EventPhoto
              src={e.image}
              alt={tr("Олимпиада IQ LAND · {0}", [e.city])}
              className="reg-event-photo"
            />
            <div className="reg-choice-content">
              <span>
                {tr(e.flag)} {tr(e.country)}
              </span>
              <h2>{tr(e.city)}</h2>
              <p>{tr(e.subjects.join(" · "))}</p>
              <div className="reg-choice-details">
                <CalendarDays size={17} />
                {tr(dateLabel(e.date))}
              </div>
              <span className="reg-choice-action">
                {tr("Зарегистрировать команду ")}
                <ArrowUpRight size={20} />
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
        {tr(message)}
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
        <ErrorBox>{tr(loadError)}</ErrorBox>
        <button
          className="btn btn-secondary"
          onClick={() => window.location.reload()}
        >
          {tr("Повторить загрузку")}
        </button>
        <Link className="back-link" to="/#events">
          {tr("К афише")}
        </Link>
      </main>
    );
  if (!receipt && !registrationOpen)
    return <main className="container reg-page reg-success">
      <ShieldCheck size={45} />
      <h1>{tr("Приём заявок приостановлен")}</h1>
      <p>{tr(REGISTRATION_PAUSED_MESSAGE)}</p>
      <a className="btn btn-primary" href={generalContact.href}>{generalContact.phone}</a>
      <Link className="back-link" to="/#events">{tr("К афише")}</Link>
    </main>;
  if (!event)
    return (
      <main className="container reg-page">
        <header className="reg-heading">
          <span className="eyebrow">
            {tr("Для учителей и образовательных центров")}
          </span>
          <h1>{tr("Регистрация команды.")}</h1>
          <p>
            {tr(
              "Сначала выберите олимпиаду, на которую хотите отправить учеников.",
            )}
          </p>
        </header>
        {events.some(isOpen) ? (
          <EventChoices />
        ) : (
          <div className="empty-state">
            <CalendarDays size={40} />
            <h2>{tr("Новые олимпиады скоро появятся")}</h2>
            <p>
              {tr(
                "Сейчас нет открытых регистраций. Посмотрите афишу и программу событий.",
              )}
            </p>
            <Link className="btn btn-primary" to="/#events">
              {tr("Посмотреть афишу ")}
              <ArrowUpRight size={20} />
            </Link>
          </div>
        )}
      </main>
    );
  if (!receipt && !isOpen(event))
    return (
      <main className="container reg-page reg-success">
        <CalendarDays size={45} />
        <h1>{tr("Регистрация завершена")}</h1>
        <p>
          {tr("Приём заявок на олимпиаду в городе ")}
          {tr(event.city)}
          {tr(" завершился")} {tr(dateLabel(event.deadline))}.
        </p>
        <Link className="btn btn-primary" to="/register">
          {tr("Выбрать другую олимпиаду ")}
          <ArrowRight size={20} />
        </Link>
      </main>
    );
  if (receipt)
    return (
      <main className="container reg-page reg-success">
        <div className="reg-success-icon">
          <CheckCheck size={38} />
        </div>
        <span className="eyebrow">{tr("Заявка получена")}</span>
        <h1>{tr("Ваша команда в списке!")}</h1>
        <p>
          {tr("Организатор получил данные и свяжется с вами")}
          <br />
          {tr(
            "для подтверждения участия. Детали и оплату согласуете с организатором.",
          )}
        </p>
        <div className="reg-receipt">
          <span>{tr("Номер вашей заявки")}</span>
          <strong>{tr(receipt.id)}</strong>
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
            <Copy size={17} />
            {tr(" Скопировать номер")}
          </button>
          <div className="reg-receipt-info">
            <div>
              <small>{tr("Олимпиада")}</small>
              <strong>{tr(event.city)}</strong>
              <span>{tr(dateLabel(event.date))}</span>
            </div>
            <div>
              <small>{tr("Команда")}</small>
              <strong>{contact.center}</strong>
              <span>
                {receipt.count}
                {tr(" учеников · ")}
                {tr(teachers.length + 1)}
                {tr(" педагогов")}
              </span>
            </div>
          </div>
        </div>
        {receipt.telegramUrl && (
          <section
            className="reg-telegram"
            aria-labelledby="reg-telegram-title"
          >
            <div className="reg-telegram-icon" aria-hidden="true">
              <Send size={28} />
            </div>
            <div className="reg-telegram-copy">
              <span>{tr("Следующий шаг")}</span>
              <h2 id="reg-telegram-title">
                {tr("Присоединяйтесь к каналу олимпиады")}
              </h2>
              <p>
                {tr(
                  "Расписание, подготовка и важные новости для вашей команды — в Telegram-канале мероприятия «",
                )}
                {tr(event.title)}».
              </p>
              <a
                className="btn reg-telegram-link"
                href={receipt.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tr(
                  "Вступить в Telegram-канал олимпиады (откроется в новой вкладке)",
                )}
              >
                {tr("Вступить в Telegram-канал ")}
                <ArrowUpRight size={20} />
              </a>
              <small>
                {tr("Ссылка также сохранится в скачанном подтверждении.")}
              </small>
            </div>
          </section>
        )}
        <EventDocuments documents={receipt.documents ?? event.documents} />
        <div className="reg-success-actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              download(
                receipt.id + ".txt",
                `IQ LAND\nНомер заявки: ${receipt.id}\nОлимпиада: ${event.city}, ${dateLabel(event.date)}\nЦентр: ${contact.center}\nУчитель: ${contact.teacher}\nУчеников: ${receipt.count}\nСтатус: получена, ожидает подтверждения организатором.${receipt.telegramUrl ? `\n\nTelegram-канал олимпиады: ${receipt.telegramUrl}` : ""}`,
              )
            }
          >
            {tr("Скачать подтверждение ")}
            <Download size={18} />
          </button>
          <Link className="btn btn-secondary" to="/#events">
            {tr("Вернуться к олимпиадам ")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <p className="small muted">
          {tr(
            "Сохраните номер заявки — он пригодится при обращении к организатору.",
          )}
        </p>
      </main>
    );

  return (
    <main className="container reg-page">
      <Link className="back-link" to="/#events">
        <ArrowLeft size={17} />
        {tr(" Все олимпиады")}
      </Link>
      <header className="reg-heading">
        <span className="eyebrow">
          {tr("Участвует команда. Регистрирует учитель.")}
        </span>
        <h1>{tr("Регистрация команды.")}</h1>
        <p>
          {tr(
            "Одна заявка на всех учеников. Добавьте состав, расскажите о центре — и можно отправлять.",
          )}
        </p>
      </header>
      <section
        className="reg-event-banner"
        aria-label={tr("Выбранная олимпиада")}
      >
        <EventPhoto
          src={event.image}
          alt={tr("Олимпиада IQ LAND · {0}", [event.city])}
          className="reg-event-photo"
        />
        <div className="reg-event-content">
          <span className="eyebrow">{tr("Выбранная олимпиада")}</span>
          <h2>
            {tr(event.city)}
            <span>{tr(event.flag)}</span>
          </h2>
          <div className="reg-event-meta">
            <span>
              <MapPin size={16} />
              {tr(event.country)}
            </span>
            <span>
              <CalendarDays size={16} />
              {tr(dateLabel(event.date))}
            </span>
          </div>
        </div>
        <div className="reg-event-side">
          <strong>{tr(priceLabel(event))}</strong>
          <small>
            {tr("Заявки до ")}
            {tr(dateLabel(event.deadline))}
          </small>
          <button
            className="text-link"
            type="button"
            disabled={sending}
            onClick={() => setPicker(true)}
          >
            {tr("Сменить олимпиаду ")}
            <ChevronDown size={16} />
          </button>
        </div>
      </section>
      <div className="reg-layout">
        <div className="reg-main">
          <nav className="reg-steps" aria-label={tr("Шаги регистрации")}>
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
                  {tr(step > i + 1 ? <Check size={17} /> : i + 1)}
                </span>
                <div>
                  <strong>{tr(s.title)}</strong>
                  <small>{tr(s.hint)}</small>
                </div>
              </button>
            ))}
          </nav>
          {draft && (
            <div className="reg-draft-bar">
              <div>
                <Save size={19} />
                <span>
                  {tr("Есть сохранённый черновик")}
                  {draft.savedAt && (
                    <>
                      {" "}
                      {tr("от")} {dateTimeLabel(draft.savedAt)}
                    </>
                  )}
                </span>
              </div>
              <div className="reg-draft-actions">
                <button
                  type="button"
                  className="text-link"
                  disabled={sending}
                  onClick={restoreDraft}
                >
                  {tr("Восстановить")}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={tr("Удалить черновик")}
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
                    <span className="eyebrow">{tr("Шаг 1 из 3")}</span>
                    <h2>{tr("Ученики команды")}</h2>
                    <p>
                      {tr(
                        "Введите данные вручную или вставьте весь список за один раз.",
                      )}
                    </p>
                  </div>
                  <span className="reg-count-badge">
                    <Users size={18} />
                    {students.length}
                  </span>
                </div>
                <div className="reg-tools">
                  <button type="button" className="btn btn-primary btn-small" onClick={() => fileInput.current?.click()}>
                    <UploadCloud size={18} /> {tr("Загрузить Excel")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => {
                      setPaste(true);
                      setImportSheets([]);
                      setImportFileError("");
                      setImportErrors([]);
                    }}
                  >
                    <ClipboardPaste size={18} />
                    {tr(" Вставить список")}
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
                    <Download size={17} />
                    {tr(" Шаблон Excel")}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={!dirty}
                    onClick={saveDraft}
                  >
                    <Save size={17} />
                    {tr(" Сохранить черновик")}
                  </button>
                </div>
                <p className="reg-fast-hint">{tr("30–50 учеников? Загрузите XLSX или вставьте таблицу целиком. Класс и предметы можно указать один раз для всей группы.")}</p>
                {autoSave && <p className={"reg-autosave " + autoSave} role="status">{tr(autoSave === "saved" ? "Черновик сохранён автоматически в этой вкладке" : autoSave === "saving" ? "Сохраняю черновик…" : "Не удалось сохранить черновик. Не закрывайте вкладку.")}</p>}
                <details className="reg-bulk-disclosure">
                  <summary>
                    {tr("Общие настройки команды")}
                    <span>{tr("Класс и дисциплины для всех")}</span>
                    <ChevronDown size={18} />
                  </summary>
                  <div className="reg-bulk-settings">
                    <label className="reg-default-grade">
                      <span>{tr("Класс для новых учеников")}</span>
                      <select
                        aria-label={tr("Класс для новых учеников")}
                        value={defaults.grade}
                        onChange={(e) =>
                          setDefaults((v) => ({
                            ...v,
                            grade: e.target.value,
                          }))
                        }
                      >
                        <option value="">{tr("Выбрать класс")}</option>
                        {tr(
                          Array.from({ length: 13 }, (_, i) => (
                            <option value={i} key={i}>
                              {tr(i === 0 ? "Дошкольники" : i + " класс")}
                            </option>
                          )),
                        )}
                      </select>
                    </label>
                    <fieldset className="reg-bulk-subjects">
                      <legend>{tr("Дисциплины для новых учеников")}</legend>
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
                            <span>{tr(s)}</span>
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
                      {tr("Применить ко всем ")}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </details>
                {(students.length > 4 || query) && (
                  <label className="field reg-roster-search">
                    <span>{tr("Найти ученика в списке")}</span>
                    <input
                      type="search"
                      placeholder={tr("Имя или фамилия")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
                {(stats.issues > 0 || onlyIssues) && students.length > 1 && (
                  <button type="button" className="text-link reg-issues-filter" aria-pressed={onlyIssues} onClick={() => { setOnlyIssues(!onlyIssues); setIssueKeys(new Set(students.filter((s) => Object.keys(validateStudent(s, subjects)).length).map((s) => s.key))); setQuery(""); }}>
                    {tr(onlyIssues ? "Показать всех учеников" : "Показать только незаполненные строки")}
                  </button>
                )}
                <div className="reg-student-scroll" onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.nativeEvent.isComposing || !e.target.matches('input:not([type="checkbox"]),select')) return;
                  e.preventDefault();
                  const fields = [...e.currentTarget.querySelectorAll('input:not([type="checkbox"]),select')];
                  fields[fields.indexOf(e.target) + (e.shiftKey ? -1 : 1)]?.focus();
                }}>
                  <table className="reg-students">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>{tr("ФИО ученика")}</th>
                        <th>{tr("Дата рождения")}</th>
                        <th>{tr("Класс")}</th>
                        <th>{tr("Дисциплины")}</th>
                        <th>
                          <span className="reg-sr-only">{tr("Действия")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tr(
                        shownStudents.map(({ student: s, index: i }) => {
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
                              <td className="reg-row-number">{tr(i + 1)}</td>
                              <td data-label="ФИО ученика">
                                <input
                                  aria-label={tr("ФИО ученика {0}", [i + 1])}
                                  aria-invalid={Boolean(errors.name)}
                                  aria-describedby={
                                    errors.name ? s.key + "-name" : undefined
                                  }
                                  autoComplete="off"
                                  onPaste={(e) => {
                                    const text = e.clipboardData.getData("text");
                                    if (!/[\t\n\r]/.test(text)) return;
                                    e.preventDefault();
                                    setPasteText(text);
                                    setImportSheets([]);
                                    setImportFileError("");
                                    setImportErrors([]);
                                    setPaste(true);
                                  }}
                                  placeholder={tr("Фамилия Имя")}
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
                                    <AlertCircle size={13} />
                                    {tr(
                                      " Имя и дата повторяются — проверьте строку",
                                    )}
                                  </small>
                                )}
                              </td>
                              <td data-label="Дата рождения">
                                <input
                                  type="date"
                                  aria-label={tr("Дата рождения ученика {0}", [
                                    i + 1,
                                  ])}
                                  aria-invalid={Boolean(errors.birth)}
                                  aria-describedby={
                                    errors.birth ? s.key + "-birth" : undefined
                                  }
                                  min="1990-01-01"
                                  max={yesterday()}
                                  value={s.birth}
                                  onChange={(e) =>
                                    updateStudent(
                                      s.key,
                                      "birth",
                                      e.target.value,
                                    )
                                  }
                                />
                                <FieldError
                                  id={s.key + "-birth"}
                                  message={errors.birth}
                                />
                              </td>
                              <td data-label="Класс">
                                <select
                                  aria-label={tr("Класс ученика {0}", [i + 1])}
                                  aria-invalid={Boolean(errors.grade)}
                                  aria-describedby={
                                    errors.grade ? s.key + "-grade" : undefined
                                  }
                                  value={s.grade}
                                  onChange={(e) =>
                                    updateStudent(
                                      s.key,
                                      "grade",
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="">—</option>
                                  {tr(
                                    Array.from({ length: 13 }, (_, n) => (
                                      <option value={n} key={n}>
                                        {tr(n === 0 ? "Дошк." : n)}
                                      </option>
                                    )),
                                  )}
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
                                              : s.subjects.filter(
                                                  (x) => x !== v,
                                                ),
                                          )
                                        }
                                      />
                                      <span>{tr(v)}</span>
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
                                    aria-label={tr(
                                      "Добавить похожего ученика {0}",
                                      [i + 1],
                                    )}
                                    title={tr(
                                      "Добавить ученика с такими же датой, классом и дисциплинами",
                                    )}
                                    disabled={students.length >= 300}
                                    onClick={() => copyStudent(s)}
                                  >
                                    <Copy size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn delete-btn"
                                    aria-label={tr("Удалить ученика {0}", [
                                      i + 1,
                                    ])}
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
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
                {onlyIssues && !shownStudents.length && !query && <p className="reg-import-ready"><Check size={17} />{tr("Все строки заполнены. Можно продолжить.")}</p>}
                {query && !shownStudents.length && (
                  <p className="reg-hint">
                    {tr("Такого ученика нет в списке. Измените поиск.")}
                  </p>
                )}
                {!students.length && (
                  <div className="empty-state">
                    <Users size={34} />
                    <h3>{tr("Начнём с первого ученика")}</h3>
                    <p>{tr("Добавьте строку или вставьте список из Excel.")}</p>
                  </div>
                )}
                <div className="reg-add-students">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={students.length >= 300}
                    onClick={() => addStudents()}
                  >
                    <Plus size={19} />
                    {tr(" Добавить ученика")}
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={students.length >= 300}
                    onClick={() => addStudents(5)}
                  >
                    {tr("Добавить 5 строк")}
                  </button>
                  <span>
                    {students.length}
                    {tr(" из 300")}
                  </span>
                </div>
                <p className="reg-hint">
                  <ShieldCheck size={17} />
                  {tr(
                    " Имена нужны для протокола и сертификатов. Проверьте написание перед отправкой.",
                  )}
                </p>
              </section>
            )}
            {step === 2 && (
              <section className="reg-form-card">
                <div className="reg-panel-head">
                  <div>
                    <span className="eyebrow">{tr("Шаг 2 из 3")}</span>
                    <h2>{tr("Центр и учителя")}</h2>
                    <p>
                      {tr(
                        "Кому сообщить детали участия и подготовить благодарственные сертификаты?",
                      )}
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
                        {tr(label)} <b>*</b>
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
                        placeholder={tr(placeholder)}
                        value={contact[key]}
                        onChange={(e) => {
                          setContact((v) => ({
                            ...v,
                            [key]: e.target.value,
                          }));
                          setContactErrors((v) => ({
                            ...v,
                            [key]: undefined,
                          }));
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
                    <h3>{tr("Благодарственные сертификаты")}</h3>
                    <p>
                      {tr(
                        "Ответственный учитель уже включён. Добавьте остальных педагогов, которым нужен сертификат.",
                      )}
                    </p>
                  </div>
                </div>
                {teachers.map((teacher, i) => (
                  <div key={i} className="reg-teacher-row">
                    <label className="field">
                      <span>
                        {tr("ФИО педагога ")}
                        {tr(i + 1)}
                      </span>
                      <input
                        aria-label={tr("ФИО дополнительного учителя {0}", [
                          i + 1,
                        ])}
                        maxLength={150}
                        placeholder={tr("Фамилия Имя Отчество")}
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
                      aria-label={tr("Удалить учителя {0}", [i + 1])}
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
                  <Plus size={19} />
                  {tr(" Добавить педагога")}
                </button>
                <label className="field reg-note-field">
                  <span>
                    {tr("Комментарий для организатора ")}
                    <small>{tr("Необязательно")}</small>
                  </span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder={tr(
                      "Например, особые пожелания по программе поездки",
                    )}
                    value={contact.note}
                    onChange={(e) =>
                      setContact((v) => ({ ...v, note: e.target.value }))
                    }
                  />
                  <FieldError id="contact-note" message={contactErrors.note} />
                </label>
                <button className="text-link" type="button" onClick={saveDraft}>
                  <Save size={17} />
                  {tr(" Сохранить черновик")}
                </button>
              </section>
            )}
            {step === 3 && (
              <section className="reg-form-card">
                <div className="reg-panel-head">
                  <div>
                    <span className="eyebrow">{tr("Шаг 3 из 3")}</span>
                    <h2>{tr("Проверьте заявку")}</h2>
                    <p>
                      {tr(
                        "Проверьте имена учеников и контакты. После отправки заявку увидит организатор.",
                      )}
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
                    {tr("Изменить контакты")}
                  </button>
                </div>
                <div className="reg-review-grid">
                  <div>
                    <small>{tr("Город центра")}</small>
                    <strong>{tr(contact.city)}</strong>
                  </div>
                  <div>
                    <small>{tr("Ответственный учитель")}</small>
                    <strong>{contact.teacher}</strong>
                  </div>
                  <div>
                    <small>{tr("Телефон")}</small>
                    <strong>{contact.phone}</strong>
                  </div>
                  <div>
                    <small>Email</small>
                    <strong>{contact.email}</strong>
                  </div>
                </div>
                <div className="reg-review-heading">
                  <h3>
                    {tr("Ученики · ")}
                    {students.length}
                  </h3>
                  <button
                    className="text-link"
                    type="button"
                    disabled={sending}
                    onClick={() => goTo(1)}
                  >
                    {tr("Изменить состав")}
                  </button>
                </div>
                <div className="reg-review-students">
                  {students.map((s, i) => (
                    <div key={s.key}>
                      <span>{tr(i + 1)}</span>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {tr(
                            Number(s.grade) === 0
                              ? "Дошкольник"
                              : s.grade + " класс",
                          )}{" "}
                          · {tr(s.birth.split("-").reverse().join("."))}
                        </small>
                      </div>
                      <span>{tr(s.subjects.join(", "))}</span>
                    </div>
                  ))}
                </div>
                {teachers.length > 0 && (
                  <div className="reg-review-note">
                    <small>{tr("Дополнительные сертификаты педагогам")}</small>
                    <p>{teachers.join(", ")}</p>
                  </div>
                )}
                {contact.note && (
                  <div className="reg-review-note">
                    <small>{tr("Комментарий")}</small>
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
                    {tr(CONSENT_TEXT)}{" "}
                    <Link to="/privacy" target="_blank">
                      {tr("Условия обработки данных")}
                    </Link>
                  </span>
                </label>
                <p className="muted small">{tr("Не указывайте ИИН, паспортные данные, медицинские сведения и данные банковских карт в комментариях или файлах со списком учеников.")}</p>
              </section>
            )}
            {error && <ErrorBox>{tr(error)}</ErrorBox>}
            <div className="reg-footer-bar">
              <div>
                <strong>
                  {tr(
                    step === 1
                      ? `${stats.ready} из ${stats.total} учеников готовы`
                      : step === 2
                        ? `${students.length} учеников в команде`
                        : "Заявка готова к отправке",
                  )}
                </strong>
                <p>
                  {tr(
                    step === 1
                      ? stats.issues
                        ? "Заполните данные всех учеников"
                        : "Можно переходить к контактам"
                      : step === 2
                        ? "Контакты нужны для подтверждения участия"
                        : "Организатор свяжется с вами после получения заявки",
                  )}
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
                    <ArrowLeft size={18} />
                    {tr(" Назад")}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={sending}
                >
                  {tr(
                    sending
                      ? "Отправляем…"
                      : step === 3
                        ? "Отправить заявку"
                        : "Продолжить",
                  )}
                  {step === 3 ? <Check size={20} /> : <ArrowRight size={20} />}
                </button>
              </div>
            </div>
          </form>
        </div>
        <aside className="reg-aside">
          <div className="reg-summary-card">
            <span className="reg-summary-label">{tr("Ваша команда")}</span>
            <div className="reg-total">
              <strong>{tr(students.length.toString().padStart(2, "0"))}</strong>
              <span>
                {tr("учеников")}
                <br />
                {tr("в одной заявке")}
              </span>
            </div>
            <div className="reg-summary-line">
              <span>{tr("Заполнено")}</span>
              <strong>
                {tr(stats.ready)}
                {tr(" из ")}
                {tr(stats.total)}
              </strong>
            </div>
            <div className="reg-summary-line">
              <span>{tr("Педагогов")}</span>
              <strong>{tr(teachers.filter((v) => v.trim()).length + 1)}</strong>
            </div>
            <div className="reg-subject-count">
              {subjects.map((s) => (
                <div key={s}>
                  <span>{tr(s)}</span>
                  <strong>
                    {students.filter((v) => v.subjects.includes(s)).length}
                  </strong>
                </div>
              ))}
            </div>
            <p className="reg-hint">
              {tr("Один ученик может участвовать в нескольких дисциплинах.")}
            </p>
          </div>
          <div className="reg-summary-card">
            <span className="reg-summary-label">{tr("В программе")}</span>
            <ul className="reg-checklist">
              {event.includes.map((s) => (
                <li key={s}>
                  <Check size={17} />
                  {tr(s)}
                </li>
              ))}
            </ul>
            <p className="reg-hint">
              {tr("Стоимость и детали организатор подтвердит после заявки.")}
            </p>
          </div>
          <div className="reg-hint">
            <ShieldCheck size={19} />
            <span>
              {tr(
                "Заявку заполняет учитель. Отдельные аккаунты учеников не нужны.",
              )}
            </span>
          </div>
        </aside>
      </div>
      {picker && (
        <Modal
          title={tr("Выберите олимпиаду")}
          onClose={() => setPicker(false)}
          wide
        >
          {dirty && (
            <p>
              {tr(
                "Состав команды и контакты сохранятся. Дисциплины нужно будет проверить по программе новой олимпиады.",
              )}
            </p>
          )}
          <EventChoices />
        </Modal>
      )}
      <input ref={fileInput} type="file" hidden accept=".xlsx,.csv,.tsv,.txt" aria-label={tr("Загрузить список учеников из файла")} onChange={(e) => { const file = e.target.files[0]; e.target.value = ""; loadRosterFile(file); }} />
      {paste && (
        <Modal
          title={tr("Вставить список учеников")}
          onClose={closeImport}
          wide
        >
          <div className="reg-import-file-tools">
            <button type="button" className="btn btn-secondary btn-small" disabled={importBusy} onClick={() => fileInput.current?.click()}><UploadCloud size={18} />{tr("Выбрать файл XLSX или CSV")}</button>
            <small>{tr("До 300 учеников · файл до 5 МБ · данные читаются в вашем браузере")}</small>
          </div>
          {importBusy && <p role="status">{tr("Читаю список…")}</p>}
          {importFileError && <ErrorBox>{tr(importFileError)}</ErrorBox>}
          {importSheets.length > 1 && <label className="field"><span>{tr("Лист Excel")}</span><select aria-label={tr("Лист Excel")} value={importSheet} disabled={importBusy} onChange={(e) => { const index = Number(e.target.value); setImportSheet(index); setPasteText(importSheets[index].text); setImportErrors([]); }}>{importSheets.map((sheet, i) => <option value={i} key={i}>{sheet.name}</option>)}</select></label>}
          <div className="reg-import-defaults">
            <label className="field"><span>{tr("Класс для строк без класса")}</span><select aria-label={tr("Класс для строк без класса")} value={defaults.grade} disabled={importBusy} onChange={(e) => { setDefaults((v) => ({ ...v, grade: e.target.value })); setImportErrors([]); }}><option value="">{tr("Выбрать класс")}</option>{Array.from({ length: 13 }, (_, i) => <option value={i} key={i}>{tr(i === 0 ? "Дошкольники" : i + " класс")}</option>)}</select></label>
            <fieldset><legend>{tr("Дисциплины для новых учеников")}</legend><div className="reg-subject-options">{subjects.map((s) => <label className={defaults.subjects.includes(s) ? "is-selected" : ""} key={s}><input type="checkbox" checked={defaults.subjects.includes(s)} disabled={importBusy} onChange={(e) => { setDefaults((v) => ({ ...v, subjects: e.target.checked ? [...v.subjects, s] : v.subjects.filter((subject) => subject !== s) })); setImportErrors([]); }} />{tr(s)}</label>)}</div></fieldset>
          </div>
          <details className="reg-import-source" open={!importSheets.length}>
          <summary>{tr("Вставить или изменить исходную таблицу")}</summary>
          <p>
            {tr("Скопируйте из Excel столбцы")}{" "}
            <strong>{tr("ФИО, дата рождения, класс")}</strong>
            {tr(
              ". Одна строка — один ученик. Четвёртым столбцом можно указать дисциплины через запятую.",
            )}
          </p>
          <div className="reg-import-help">
            <span>{tr("Пример")}</span>
            <code>
              {tr("Иванов Иван;15.03.2015;5")}
              <br />
              {tr("Ахметова Алия;22.07.2016;4")}
            </code>
          </div>
          <label className="field">
            <span>{tr("Список учеников")}</span>
            <textarea
              rows={7}
              aria-label={tr("Список учеников")}
              autoFocus
              disabled={importBusy}
              maxLength={2000000}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setImportFileError("");
                setImportErrors([]);
              }}
              placeholder={tr(
                "ФИО\tДата рождения\tКласс\nИванов Иван\t15.03.2015\t5",
              )}
            />
          </label>
          </details>
          {imported.students.length > 0 && <div className="reg-import-preview"><strong>{tr("Найдено учеников: {0}", [imported.students.length])}</strong><p>{tr("Первые строки для проверки. Столбцы с заголовками распознаются автоматически.")}</p><div><table><thead><tr><th>{tr("ФИО")}</th><th>{tr("Дата рождения")}</th><th>{tr("Класс")}</th></tr></thead><tbody>{imported.students.slice(0, 5).map((s) => <tr key={s.key}><td>{s.name}</td><td>{s.birth}</td><td>{s.grade}</td></tr>)}</tbody></table></div></div>}
          {imported.errors.length > 0 && imported.students.length > 0 && !imported.fatal && <p className="reg-import-warning">{tr("Нужно исправить строк: {0}", [new Set(imported.errors.map((issue) => issue.line)).size])}</p>}
          <p className="small muted">
            {tr(
              "Дата: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД. Класс 0 — дошкольник. Заполненные строки в вашей команде сохранятся.",
            )}
          </p>
          {importErrors.length > 0 && (
            <div className="reg-import-errors" role="alert">
              <strong>
                {tr("Исправьте список — пока ничего не добавлено")}
              </strong>
              <ul>
                {importErrors.slice(0, 8).map((issue, index) => (
                  <li key={index}>
                    {tr(issue.line ? `Строка ${issue.line}: ` : "")}
                    {issue.messages
                      ? issue.messages.map((message) => tr(message)).join(" ")
                      : tr(issue.message)}
                  </li>
                ))}
              </ul>
              {importErrors.length > 8 && (
                <p>
                  {tr("И ещё ошибок: ")}
                  {tr(importErrors.length - 8)}
                </p>
              )}
            </div>
          )}
          {pasteText.trim() && !imported.errors.length && (
            <p className="reg-import-ready">
              <Check size={17} />
              {tr(" Готово к добавлению:")} {imported.students.length}
              {tr(" учеников")}
            </p>
          )}
          <button
            className="btn btn-primary full-width"
            type="button"
            disabled={importBusy || Boolean(importFileError)}
            onClick={() => importStudents()}
          >
            {tr("Добавить учеников ")}
            <Plus size={19} />
          </button>
          {imported.errors.length > 0 && !imported.fatal && imported.students.length > 0 && <button className="btn btn-secondary full-width reg-import-fix" type="button" disabled={importBusy || Boolean(importFileError)} onClick={() => importStudents(true)}>{tr("Добавить список и исправить ошибки в форме")}</button>}
        </Modal>
      )}
      {leaveTo && (
        <Modal
          title={tr("Сохранить состав команды?")}
          onClose={() => setLeaveTo(null)}
        >
          <p>
            {tr(
              "В форме есть заполненные данные. Можно сохранить черновик и вернуться к нему в этой вкладке.",
            )}
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
              {tr("Сохранить и выйти ")}
              <Save size={18} />
            </button>
            <button
              className="btn btn-secondary full-width"
              onClick={() => {
                const target = leaveTo;
                try { sessionStorage.removeItem(draftKey(event.id)); } catch {}
                setLeaveTo(null);
                navigate(target);
              }}
            >
              {tr("Выйти без сохранения")}
            </button>
            <button className="text-link" onClick={() => setLeaveTo(null)}>
              {tr("Остаться в форме")}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
