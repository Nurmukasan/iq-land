import {
  tr,
  getIntlLocale,
  getLanguage,
  dateTimeLabel,
} from "../i18n/runtime.js";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  Download,
  Eye,
  EyeOff,
  Film,
  GraduationCap,
  ImagePlus,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  api,
  dateLabel,
  priceLabel,
  useApp,
  Spinner,
  ErrorBox,
  Modal,
} from "../main";
import EventPhoto from "../components/EventPhoto";
import EventVideoUploader from "../components/EventVideoUploader";
import EventDocumentsUploader from "../components/EventDocumentsUploader";
import CabinetSidebar from "../components/CabinetSidebar";

const isPastEvent = (event) =>
  event.date < new Date().toISOString().slice(0, 10);

const statusNames = {
  new: "Новая",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
};
export function Login() {
  const { user, setUser, authReady } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!authReady) return <Spinner />;
  if (user) return <Navigate to="/cabinet" replace />;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(d.user);
      navigate("/cabinet");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-intro">
        <span className="eyebrow">{tr("КОМАНДА IQ LAND")}</span>
        <h1>
          {tr("За каждым открытием —")}
          <br />
          <span className="serif-text">{tr("люди, которые верят.")}</span>
        </h1>
        <p>
          {tr(
            "Ваше рабочее пространство для управления олимпиадами, заявками и результатами.",
          )}
        </p>
        <div className="login-art">
          <GlobeIcon />
          <span>LEARN. TRAVEL. GROW.</span>
        </div>
      </div>
      <section className="login-card">
        <div className="login-icon">
          <ShieldCheck size={25} />
        </div>
        <h2>{tr("С возвращением")}</h2>
        <p>{tr("Войдите в кабинет организатора")}</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              placeholder={tr("Ваш рабочий email")}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{tr("Пароль")}</span>
            <div className="password-field">
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder={tr("Введите пароль")}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={tr(show ? "Скрыть пароль" : "Показать пароль")}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <ErrorBox>{tr(error)}</ErrorBox>}
          <button className="btn btn-primary full-width" disabled={busy}>
            {tr(busy ? "Входим…" : "Войти в кабинет")}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="login-help">
          <ShieldCheck size={16} />
          <span>
            {tr("Доступ для администратора и руководителя.")}
            <br />
            {tr("Данные входа выдаёт администратор сайта.")}
          </span>
        </div>
        <Link to="/" className="back-link">
          <ArrowLeft size={15} />
          {tr(" Вернуться на сайт")}
        </Link>
      </section>
    </main>
  );
}
function GlobeIcon() {
  return (
    <svg viewBox="0 0 200 200" fill="none">
      <circle cx="100" cy="100" r="75" />
      <ellipse cx="100" cy="100" rx="35" ry="75" />
      <ellipse cx="100" cy="100" rx="75" ry="30" />
      <path d="M25 100h150M100 25v150" />
      <path
        className="globe-orbit"
        d="M10 150C-10 90 170-5 195 50S35 215 10 150Z"
      />
    </svg>
  );
}
export default function Dashboard() {
  const location = useLocation();
  const { user, setUser, authReady, notify } = useApp();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(location.state?.section || "registrations"),
    [eventId, setEventId] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [subject, setSubject] = useState(""),
    [grade, setGrade] = useState(""),
    [detail, setDetail] = useState(null),
    [editing, setEditing] = useState(null),
    [archiving, setArchiving] = useState(null),
    [exporting, setExporting] = useState(false);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api("/manage"));
    } catch (e) {
      if (e.status === 401) setUser(null);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (user) load();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible")
        api("/manage")
          .then(setData)
          .catch((e) => {
            if (e.status === 401) setUser(null);
          });
    }, 15000);
    return () => clearInterval(t);
  }, [user]);
  if (!authReady) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  async function changeStatus(id, status) {
    try {
      await api("/registrations/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setData((d) => ({
        ...d,
        registrations: d.registrations.map((r) =>
          r.id === id ? { ...r, status } : r,
        ),
        entries: d.entries.map((r) =>
          r.registration_id === id ? { ...r, status } : r,
        ),
      }));
      setDetail((d) => (d?.id === id ? { ...d, status } : d));
      notify("Статус заявки обновлён");
    } catch (e) {
      notify(e.message);
    }
  }
  async function changeScore(id, value, previous) {
    if (String(previous ?? "") === value) return;
    const score = value === "" ? null : Number(value);
    if (
      score !== null &&
      (!Number.isFinite(score) || score < 0 || score > 1000000)
    ) {
      notify("Укажите баллы от 0 до 1 000 000");
      return false;
    }
    try {
      await api("/entries/" + id, {
        method: "PATCH",
        body: JSON.stringify({ score }),
      });
      setData((d) => ({
        ...d,
        entries: d.entries.map((r) => (r.id === id ? { ...r, score } : r)),
      }));
      notify("Результат сохранён");
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }
  async function exportExcel() {
    setExporting(true);
    try {
      const res = await fetch(
        "/api/export" +
          (eventId ? "?event=" + encodeURIComponent(eventId) : ""),
        { headers: { "Accept-Language": getIntlLocale() } },
      );
      if (!res.ok) throw new Error("Не удалось выгрузить файл");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "IQ-LAND" +
        (eventId
          ? "-" + (data.events.find((e) => e.id === eventId)?.city || "")
          : "") +
        ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Excel-файл готов");
    } catch (e) {
      notify(e.message);
    } finally {
      setExporting(false);
    }
  }
  const registrations = (data?.registrations || []).filter(
    (r) =>
      (!eventId || r.event_id === eventId) &&
      (!status || r.status === status) &&
      (!query ||
        [r.center, r.teacher, r.city, r.id]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const entries = (data?.entries || [])
    .filter(
      (r) =>
        (!eventId || r.event_id === eventId) &&
        (!subject || r.subject === subject) &&
        (!grade || String(r.grade) === grade) &&
        r.status !== "cancelled" &&
        (!query ||
          [r.name, r.center, r.teacher]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        a.subject.localeCompare(b.subject, "ru") ||
        a.grade - b.grade ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.name.localeCompare(b.name, "ru"),
    );
  const place = (r) =>
    r.score === null
      ? "—"
      : 1 +
        data.entries.filter(
          (x) =>
            x.status !== "cancelled" &&
            x.event_id === r.event_id &&
            x.subject === r.subject &&
            x.grade === r.grade &&
            x.score !== null &&
            x.score > r.score,
        ).length;
  const selectedRegs = (data?.registrations || []).filter(
    (r) => (!eventId || r.event_id === eventId) && r.status !== "cancelled",
  );
  return (
    <main className="dashboard-page">
      <div className="container dashboard-layout">
        <CabinetSidebar
          active={tab}
          onSection={(id) => {
            setTab(id);
            setQuery("");
            setError("");
          }}
        />
        <section className="dashboard-content">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">{tr("КАБИНЕТ ОРГАНИЗАТОРА")}</span>
              <h1>
                {tr("Всё под контролем")}
                <span>.</span>
              </h1>
            </div>
            <button
              className="btn btn-primary btn-small"
              disabled={!data || exporting}
              title={tr(
                "Три листа: участники, протокол и учителя. Экспорт всех данных выбранной олимпиады.",
              )}
              onClick={exportExcel}
            >
              <Download size={17} />
              {tr(exporting ? "Готовим файл…" : "Скачать Excel")}
            </button>
          </div>
          {error && <ErrorBox>{tr(error)}</ErrorBox>}
          {!data ? (
            busy ? (
              <Spinner />
            ) : (
              <button className="btn btn-secondary" onClick={load}>
                {tr("Повторить загрузку")}
              </button>
            )
          ) : (
            <>
              <div className="stat-grid">
                {[
                  {
                    label: "Участников",
                    value: selectedRegs.reduce(
                      (s, r) => s + r.student_count,
                      0,
                    ),
                    icon: GraduationCap,
                  },
                  {
                    label: "Заявок команд",
                    value: selectedRegs.length,
                    icon: Users,
                  },
                  {
                    label: "Педагогов",
                    value: selectedRegs.reduce(
                      (s, r) => s + 1 + r.teachers.length,
                      0,
                    ),
                    icon: Building2,
                  },
                  {
                    label: "Олимпиад",
                    value: data.events.filter(
                      (e) => (!eventId || e.id === eventId) && e.active,
                    ).length,
                    icon: Trophy,
                  },
                ].map((s) => (
                  <div className="stat-card" key={s.label}>
                    <span>
                      {tr(s.label)}
                      <s.icon size={18} />
                    </span>
                    <strong>{tr(s.value.toString().padStart(2, "0"))}</strong>
                  </div>
                ))}
              </div>
              {(tab === "registrations" || tab === "protocol") && (
                <div className="workspace-panel">
                  <div className="workspace-heading">
                    <div>
                      <h2>
                        {tr(
                          tab === "registrations"
                            ? "Заявки команд"
                            : "Протокол олимпиады",
                        )}
                      </h2>
                      <p>
                        {tr(
                          tab === "registrations"
                            ? "Новые заявки появляются здесь после отправки формы."
                            : "Сортировка по олимпиаде, дисциплине, классу, баллам и имени.",
                        )}
                      </p>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={load}
                      disabled={busy}
                      aria-label={tr("Обновить данные")}
                    >
                      <RefreshCw size={18} className={busy ? "spin" : ""} />
                    </button>
                  </div>
                  <div className="workspace-filters">
                    <label className="search-input">
                      <Search size={16} />
                      <input
                        placeholder={tr(
                          tab === "registrations"
                            ? "Центр, учитель или номер…"
                            : "Ученик, центр или учитель…",
                        )}
                        aria-label={tr("Поиск")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label={tr("Олимпиада")}
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">{tr("Все олимпиады")}</option>
                      {data.events.map((e) => (
                        <option value={e.id} key={e.id}>
                          {tr(e.city)} · {tr(dateLabel(e.date))}
                        </option>
                      ))}
                    </select>
                    {tab === "registrations" ? (
                      <select
                        aria-label={tr("Статус заявки")}
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">{tr("Все статусы")}</option>
                        {Object.entries(statusNames).map(([k, v]) => (
                          <option key={k} value={k}>
                            {tr(v)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select
                          aria-label={tr("Дисциплина")}
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          <option value="">{tr("Все дисциплины")}</option>
                          {[
                            "Английский язык",
                            "Математика",
                            "Ментальная арифметика",
                          ].map((s) => (
                            <option key={s} value={s}>
                              {tr(s)}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={tr("Класс")}
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                        >
                          <option value="">{tr("Все классы")}</option>
                          {tr(
                            Array.from({ length: 13 }, (_, i) => (
                              <option key={i} value={i}>
                                {tr(i === 0 ? "Дошкольники" : i + " класс")}
                              </option>
                            )),
                          )}
                        </select>
                      </>
                    )}
                  </div>
                  {tab === "registrations" ? (
                    registrations.length ? (
                      <div className="manage-table-wrap">
                        <table className="manage-table">
                          <thead>
                            <tr>
                              <th>{tr("Команда / центр")}</th>
                              <th>{tr("Олимпиада")}</th>
                              <th>{tr("Ученики")}</th>
                              <th>{tr("Статус")}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {registrations.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <strong>{r.center}</strong>
                                  <small>
                                    {r.teacher} · {tr(r.city)}
                                  </small>
                                  <small className="registration-code">
                                    {tr(r.id)}
                                  </small>
                                </td>
                                <td>
                                  {tr(
                                    data.events.find((e) => e.id === r.event_id)
                                      ?.city,
                                  )}
                                  <small>
                                    {tr(
                                      dateLabel(
                                        data.events.find(
                                          (e) => e.id === r.event_id,
                                        ).date,
                                      ),
                                    )}
                                  </small>
                                </td>
                                <td>
                                  <span className="number-pill">
                                    {tr(r.student_count)}
                                  </span>
                                </td>
                                <td>
                                  <select
                                    className={
                                      "status-select status-" + r.status
                                    }
                                    aria-label={tr("Статус заявки " + r.id)}
                                    value={r.status}
                                    onChange={(e) =>
                                      changeStatus(r.id, e.target.value)
                                    }
                                  >
                                    {Object.entries(statusNames).map(
                                      ([k, v]) => (
                                        <option key={k} value={k}>
                                          {tr(v)}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </td>
                                <td>
                                  <button
                                    className="icon-btn"
                                    onClick={() => setDetail(r)}
                                    aria-label={tr("Открыть заявку " + r.id)}
                                  >
                                    <ArrowUpRight size={19} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state">
                        <Users size={34} />
                        <h3>
                          {tr(
                            query || eventId || status
                              ? "Заявки не найдены"
                              : "Здесь появится ваша первая команда",
                          )}
                        </h3>
                        <p>
                          {tr(
                            query || eventId || status
                              ? "Попробуйте изменить условия поиска."
                              : "Отправленные учителем заявки автоматически попадут в этот список.",
                          )}
                        </p>
                        <Link to="/#events" className="text-link">
                          {tr("Перейти к афише ")}
                          <ArrowUpRight size={17} />
                        </Link>
                      </div>
                    )
                  ) : entries.length ? (
                    <div className="manage-table-wrap">
                      <table className="manage-table protocol-table">
                        <thead>
                          <tr>
                            <th>{tr("Участник")}</th>
                            <th>{tr("Дисциплина / класс")}</th>
                            <th>{tr("Баллы")}</th>
                            <th>{tr("Рейтинг")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.name}</strong>
                                <small>
                                  {r.center} · {tr(r.event_city)}
                                </small>
                              </td>
                              <td>
                                {tr(r.subject)}
                                <small>
                                  {tr(
                                    r.grade === 0
                                      ? "Дошкольник"
                                      : r.grade + " класс",
                                  )}
                                </small>
                              </td>
                              <td>
                                <ScoreInput row={r} onSave={changeScore} />
                              </td>
                              <td>
                                <span
                                  className={
                                    place(r) === 1
                                      ? "place-badge first"
                                      : "place-badge"
                                  }
                                >
                                  {tr(place(r))}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <ListChecks size={34} />
                      <h3>{tr("Протокол пока пуст")}</h3>
                      <p>
                        {tr(
                          "Участники появятся после первой заявки. Отменённые заявки в протокол не включаются.",
                        )}
                      </p>
                    </div>
                  )}
                  <div className="table-bottom">
                    <span>
                      {tr(
                        tab === "registrations"
                          ? `Найдено заявок: ${registrations.length}`
                          : `Участий в дисциплинах: ${entries.length}`,
                      )}
                    </span>
                    <span>
                      {tr(
                        tab === "protocol"
                          ? "Рейтинг по классу и предмету. Медали рассчитываются в разделе «Присвоение мест»."
                          : "Автообновление каждые 15 секунд. Отменённые заявки сохраняются в списке.",
                      )}
                    </span>
                  </div>
                </div>
              )}
              {tab === "events" && (
                <div className="workspace-panel">
                  <div className="workspace-heading">
                    <div>
                      <h2>{tr("Мероприятия")}</h2>
                      <p>
                        {tr(
                          "Афиша, программа, стоимость и канал для участников.",
                        )}
                      </p>
                    </div>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => setEditing({})}
                    >
                      <Plus size={16} />
                      {tr(" Добавить")}
                    </button>
                  </div>
                  <div className="event-manage-list">
                    {data.events.map((e) => (
                      <div key={e.id}>
                        <EventPhoto
                          src={e.image}
                          alt={tr(e.city)}
                          className="event-manage-photo"
                        />
                        <div>
                          <h3>
                            {tr(e.flag)} {tr(e.city)}, {tr(e.country)}
                          </h3>
                          <p>
                            {tr(dateLabel(e.date))} · {tr(priceLabel(e))}
                          </p>
                          <span
                            className={
                              "availability-pill " +
                              (!e.active ? "inactive" : "")
                            }
                          >
                            {tr(
                              e.active
                                ? isPastEvent(e)
                                  ? "В архиве"
                                  : "Опубликовано"
                                : "Скрыто с сайта",
                            )}
                          </span>
                        </div>
                        <div className="event-manage-actions">
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => setEditing(e)}
                          >
                            <Pencil size={15} />
                            {tr(" Изменить")}
                          </button>
                          {isPastEvent(e) && user.role === "admin" && (
                            <button
                              className="btn btn-secondary btn-small event-archive-button"
                              onClick={() => setArchiving(e)}
                            >
                              <Film size={15} />
                              {tr(" Итоги и видео")}
                            </button>
                          )}
                          {isPastEvent(e) && e.active && (
                            <Link
                              to={"/archive/" + e.id}
                              className="text-link event-manage-public-link"
                            >
                              {tr("Открыть страницу олимпиады")}{" "}
                              <ArrowUpRight size={15} />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === "promo" && user.role === "admin" && <PromoEditor />}
            </>
          )}
        </section>
      </div>
      {detail && (
        <Modal
          title={tr("Заявка " + detail.id)}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-center">
            <Building2 size={25} />
            <div>
              <h3>{detail.center}</h3>
              <p>
                {tr(detail.city)} ·{" "}
                {tr(data.events.find((e) => e.id === detail.event_id)?.city)}
              </p>
            </div>
            <span className={"status-tag status-" + detail.status}>
              {tr(statusNames[detail.status])}
            </span>
          </div>
          <div className="review-grid">
            <div>
              <small>{tr("Ответственный учитель")}</small>
              <strong>{detail.teacher}</strong>
            </div>
            <div>
              <small>{tr("Контакты")}</small>
              <strong>{detail.phone}</strong>
              <span>{detail.email}</span>
            </div>
          </div>
          <h4>{tr("Ученики")}</h4>
          <div className="review-list">
            {Object.values(
              data.entries
                .filter((r) => r.registration_id === detail.id)
                .reduce((acc, r) => {
                  const key = r.student_id;
                  acc[key] ??= { ...r, subjects: [] };
                  acc[key].subjects.push(r.subject);
                  return acc;
                }, {}),
            ).map((r, i) => (
              <div key={r.id}>
                <span className="row-number">{tr(i + 1)}</span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {tr(r.birth.split("-").reverse().join("."))} ·{" "}
                    {tr(r.grade === 0 ? "Дошкольник" : r.grade + " класс")}
                  </small>
                </div>
                <span>{tr(r.subjects.join(", "))}</span>
              </div>
            ))}
          </div>
          <h4>{tr("Дополнительные сертификаты педагогам")}</h4>
          <p>
            {detail.teachers.length
              ? detail.teachers.join(", ")
              : tr("Не запрошены")}
          </p>
          {detail.note && (
            <>
              <h4>{tr("Комментарий")}</h4>
              <p>{detail.note}</p>
            </>
          )}
          <p className="muted small">
            {tr("Получена: ")}
            {tr(dateTimeLabel(detail.created))}
          </p>
          <p className="muted small">{detail.privacy_version
            ? <>{tr("Редакция условий")}: {detail.privacy_version} · {tr(dateTimeLabel(detail.consent_at))}</>
            : tr("У этой заявки нет сохранённой редакции согласия. Проверьте подтверждающие документы отдельно.")}</p>
        </Modal>
      )}
      {editing && (
        <EventEditor
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            notify("Мероприятие сохранено");
          }}
        />
      )}
      {archiving && user.role === "admin" && (
        <ArchiveEditor
          event={archiving}
          onClose={() => setArchiving(null)}
          onSaved={() => {
            setArchiving(null);
            load();
            notify("Итоги олимпиады сохранены");
          }}
        />
      )}
    </main>
  );
}
function ArchiveEditor({ event, onClose, onSaved }) {
  const [video, setVideo] = useState(event.video || ""),
    [uploading, setUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(false),
    saving = useRef(false),
    uploadBusy = useRef(false),
    request = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function save(eventObject) {
    eventObject.preventDefault();
    if (saving.current || uploadBusy.current) return;
    saving.current = true;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await api("/events/" + event.id + "/archive", {
        method: "PUT",
        body: JSON.stringify({ video, resultsPublished: false }),
        signal: controller.signal,
      });
      if (mounted.current) onSaved();
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Modal title={tr("Итоги олимпиады · " + event.city)} onClose={onClose} wide>
      <form className="archive-editor-form" onSubmit={save}>
        <div className="archive-editor-event">
          <EventPhoto
            src={event.image}
            alt={tr(event.city)}
            className="archive-editor-photo"
          />
          <div className="archive-editor-event-info">
            <span>
              {tr(event.flag)} {tr(event.country)}
            </span>
            <strong>{tr(event.title)}</strong>
            <small>
              <CalendarDays size={14} /> {tr(dateLabel(event.date))}
            </small>
          </div>
        </div>
        <p className="archive-editor-intro">
          {tr(
            "Сохраните воспоминания об олимпиаде. Сохранённое видео появится на странице прошедшей олимпиады.",
          )}
        </p>
        <EventVideoUploader
          value={video}
          onChange={(value) => {
            setVideo(value);
            setError("");
          }}
          onBusyChange={(value) => {
            uploadBusy.current = value;
            setUploading(value);
            if (value) setError("");
          }}
          disabled={busy}
        />
        <div className="notice">
          {tr(
            "На странице олимпиады публикуется видео и программа. Имена учеников и награды доступны только организаторам.",
          )}
          <p>{tr("Публикуйте только материалы, на которые у вас есть права. Для узнаваемых детей получите отдельные разрешения законных представителей на публикацию изображения; согласие на регистрацию этого не заменяет. Не используйте музыку без необходимых прав.")}</p>
        </div>
        {event.active && isPastEvent(event) && (
          <Link
            className="text-link archive-editor-public-link"
            to={"/archive/" + event.id}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("Открыть страницу олимпиады ")}
            <ArrowUpRight size={17} />
          </Link>
        )}
        {!event.active && (
          <p className="archive-editor-hidden-note">
            {tr(
              "Олимпиада скрыта с сайта. Видео станет доступно после публикации мероприятия.",
            )}
          </p>
        )}
        {error && <ErrorBox>{tr(error)}</ErrorBox>}
        <div className="archive-editor-actions">
          {uploading && (
            <p role="status">{tr("Дождитесь завершения загрузки видео.")}</p>
          )}
          <button
            className="btn btn-primary full-width"
            type="submit"
            disabled={busy || uploading}
          >
            {tr(busy ? "Сохраняем…" : "Сохранить итоги")} <Check size={18} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ScoreInput({ row, onSave }) {
  const [value, setValue] = useState(String(row.score ?? "")),
    [invalid, setInvalid] = useState(false);
  useEffect(() => setValue(String(row.score ?? "")), [row.score]);
  return (
    <input
      className={"score-input " + (invalid ? "invalid" : "")}
      type="number"
      min="0"
      max="1000000"
      step="0.5"
      aria-label={tr("Баллы " + row.name + ", " + row.subject)}
      value={value}
      placeholder="—"
      onChange={(e) => {
        setValue(e.target.value);
        setInvalid(false);
      }}
      onBlur={async () => {
        const result = await onSave(row.id, value, row.score);
        if (result === false) setInvalid(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
const photoTypes = ["image/jpeg", "image/png", "image/webp"];
const maxPhotoBytes = 8 * 1024 * 1024;

function EventPhotoUploader({ value, onChange, onBusyChange, disabled }) {
  const inputId = useId();
  const input = useRef(null),
    request = useRef(null),
    previewUrl = useRef(""),
    generation = useRef(0),
    mounted = useRef(false);
  const [preview, setPreview] = useState(""),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState(""),
    [dragging, setDragging] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
  }

  async function upload(file) {
    if (!file || disabled) return;
    const attempt = ++generation.current;
    request.current?.abort();
    clearPreview();
    setError("");
    setFileName("");
    setUploading(false);
    onBusyChange(false);
    if (!photoTypes.includes(file.type)) {
      setError("Выберите фото в формате JPEG, PNG или WebP.");
      return;
    }
    if (!file.size) {
      setError("Файл пустой. Выберите другое фото.");
      return;
    }
    if (file.size > maxPhotoBytes) {
      setError("Фото больше 8 МБ. Выберите файл меньшего размера.");
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    const localUrl = URL.createObjectURL(file);
    previewUrl.current = localUrl;
    setPreview(localUrl);
    setFileName(file.name);
    setUploading(true);
    onBusyChange(true);
    try {
      const result = await api("/event-images", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
        signal: controller.signal,
      });
      if (!mounted.current || generation.current !== attempt) return;
      if (
        typeof result.url !== "string" ||
        !result.url.startsWith("/api/event-images/")
      )
        throw new Error(
          "Сервер не вернул фото. Попробуйте загрузить его ещё раз.",
        );
      onChange(result.url);
      clearPreview();
    } catch (error) {
      if (!mounted.current || generation.current !== attempt) return;
      clearPreview();
      setFileName("");
      setError(
        error.message || "Не удалось загрузить фото. Попробуйте ещё раз.",
      );
    } finally {
      if (mounted.current && generation.current === attempt) {
        request.current = null;
        setUploading(false);
        onBusyChange(false);
      }
    }
  }

  function remove() {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    clearPreview();
    setUploading(false);
    onBusyChange(false);
    setFileName("");
    setError("");
    onChange("");
  }

  const hasPhoto = Boolean(preview || value);
  return (
    <section
      className={
        "event-photo-upload" +
        (dragging ? " is-dragging" : "") +
        (error ? " has-error" : "")
      }
      aria-label={tr("Фото мероприятия")}
      aria-busy={uploading}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files[0]);
      }}
    >
      <div className="event-photo-upload-preview">
        <EventPhoto src={preview || value} alt={tr("Фото мероприятия")} />
        {uploading && (
          <span className="event-photo-upload-progress" aria-hidden="true">
            <RefreshCw size={20} className="spin" />
          </span>
        )}
      </div>
      <div className="event-photo-upload-content">
        <div className="event-photo-upload-title">
          <ImagePlus size={21} />
          <h3>
            {tr("Фото мероприятия ")}
            <small>{tr("Необязательно")}</small>
          </h3>
        </div>
        <p>
          {tr(
            "Добавьте настоящий кадр города, площадки или прошлой олимпиады. Он появится на карточке в афише.",
          )}
        </p>
        <input
          ref={input}
          id={inputId}
          className="event-photo-file-input"
          type="file"
          accept={photoTypes.join(",")}
          aria-label={tr("Загрузить фото мероприятия")}
          aria-describedby={inputId + "-hint"}
          disabled={disabled}
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            upload(file);
          }}
        />
        <div className="event-photo-upload-actions">
          <button
            className="btn btn-secondary btn-small"
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <UploadCloud size={16} />
            {tr(hasPhoto ? "Заменить фото" : "Выбрать фото")}
          </button>
          {hasPhoto && (
            <button
              className="text-link event-photo-remove"
              type="button"
              disabled={disabled}
              onClick={remove}
            >
              <Trash2 size={16} />
              {tr(" Убрать фото")}
            </button>
          )}
        </div>
        <small id={inputId + "-hint"} className="event-photo-upload-hint">
          {tr("JPEG, PNG или WebP · до 8 МБ. Можно перетащить фото сюда.")}
        </small>
        <small className="event-photo-upload-hint">{tr("Фото и документы мероприятия доступны всем посетителям. Не публикуйте списки детей и контакты; проверьте права на материалы и разрешения на изображения.")}</small>
        {uploading ? (
          <p className="event-photo-upload-status" role="status">
            {tr("Загружаем фото…")}
          </p>
        ) : fileName ? (
          <p className="event-photo-upload-status" role="status">
            <Check size={15} />
            {tr(" Фото загружено ")}
            <span>{tr(fileName)}</span>
          </p>
        ) : null}
        {error && (
          <p className="event-photo-upload-error" role="alert">
            {tr(error)}
          </p>
        )}
      </div>
    </section>
  );
}

function EventEditor({ event, onClose, onSaved }) {
  const [form, setForm] = useState({
      title: "",
      city: "",
      country: "",
      flag: "🌍",
      date: "",
      deadline: "",
      subjects: ["Математика"],
      includes: ["Участие в олимпиаде", "Сертификат участника"],
      price: null,
      currency: "KZT",
      image: "",
      telegramUrl: "",
      documents: [],
      description: "",
      active: true,
      ...event,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [documentsUploading, setDocumentsUploading] = useState(false);
  const saving = useRef(false),
    photoBusy = useRef(false),
    documentBusy = useRef(false),
    mounted = useRef(false),
    saveRequest = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveRequest.current?.abort();
    };
  }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e) {
    e.preventDefault();
    if (saving.current || photoBusy.current || documentBusy.current) return;
    if (!form.subjects.length) {
      setError("Выберите хотя бы одну дисциплину олимпиады.");
      return;
    }
    saving.current = true;
    const controller = new AbortController();
    saveRequest.current = controller;
    setBusy(true);
    setError("");
    try {
      const { video, resultsPublished, ...details } = form;
      await api("/events" + (event.id ? "/" + event.id : ""), {
        method: event.id ? "PUT" : "POST",
        signal: controller.signal,
        body: JSON.stringify({
          ...details,
          telegramUrl: (form.telegramUrl || "").trim(),
          includes: form.includes.map((item) => item.trim()).filter(Boolean),
          price:
            form.price === "" || form.price === null
              ? null
              : Number(form.price),
        }),
      });
      if (mounted.current) onSaved();
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={tr(event.id ? "Изменить мероприятие" : "Новая олимпиада")}
      onClose={onClose}
      wide
    >
      <form onSubmit={save} className="event-editor-form">
        <EventPhotoUploader
          value={form.image}
          onChange={(url) => set("image", url)}
          onBusyChange={(value) => {
            photoBusy.current = value;
            setUploading(value);
          }}
          disabled={busy || documentsUploading}
        />
        <div className="fields-grid">
          {[
            ["title", "Название олимпиады", "text"],
            ["city", "Город", "text"],
            ["country", "Страна", "text"],
            ["flag", "Флаг / символ", "text"],
            ["date", "Дата олимпиады", "date"],
            ["deadline", "Приём заявок до", "date"],
          ].map(([k, label, type]) => (
            <label
              className={"field " + (k === "title" ? "span-two" : "")}
              key={k}
            >
              <span>{tr(label)}</span>
              <input
                type={type}
                required
                minLength={type === "text" && k !== "flag" ? 2 : undefined}
                maxLength={k === "flag" ? 8 : 150}
                placeholder={tr(
                  k === "city"
                    ? "Например, Лондон"
                    : k === "country"
                      ? "Например, Великобритания"
                      : undefined,
                )}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          <label className="field">
            <span>{tr("Стоимость · пусто, если уточняется")}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.price ?? ""}
              onChange={(e) => set("price", e.target.value)}
            />
          </label>
          <label className="field">
            <span>{tr("Валюта")}</span>
            <select
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {[
                ["KZT", "KZT · Казахстанский тенге"],
                ["USD", "USD · Доллар США"],
                ["AZN", "AZN · Азербайджанский манат"],
                ["EUR", "EUR · Евро"],
                ["GBP", "GBP · Фунт стерлингов"],
                ["AED", "AED · Дирхам ОАЭ"],
                ["TRY", "TRY · Турецкая лира"],
                ["UZS", "UZS · Узбекский сум"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {tr(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field event-telegram-field">
          <span id="event-telegram-label">
            {tr("Ссылка на Telegram-канал олимпиады · необязательно")}
          </span>
          <input
            type="url"
            maxLength={2048}
            placeholder="https://t.me/…"
            autoComplete="off"
            value={form.telegramUrl}
            aria-labelledby="event-telegram-label"
            aria-describedby="event-telegram-help"
            onChange={(e) => set("telegramUrl", e.target.value)}
          />
          <small id="event-telegram-help">
            {tr(
              "Скопируйте ссылку на канал в Telegram. Учитель увидит ссылку после отправки заявки на эту олимпиаду и в скачанном подтверждении. Чтобы убрать ссылку, очистите поле и сохраните.",
            )}
          </small>
        </label>
        <label className="field">
          <span>{tr("Дисциплины")}</span>
        </label>
        <div className="event-subject-options">
          {["Математика", "Английский язык", "Ментальная арифметика"].map(
            (s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={form.subjects.includes(s)}
                  onChange={(e) =>
                    set(
                      "subjects",
                      e.target.checked
                        ? [...form.subjects, s]
                        : form.subjects.filter((x) => x !== s),
                    )
                  }
                />
                {tr(s)}
              </label>
            ),
          )}
        </div>
        <label className="field">
          <span>{tr("Программа · один пункт на строку")}</span>
          <textarea
            rows={4}
            required
            value={form.includes.join("\n")}
            onChange={(e) => set("includes", e.target.value.split("\n"))}
          />
        </label>
        <label className="field">
          <span>{tr("Описание")}</span>
          <textarea
            rows={3}
            minLength={2}
            maxLength={2000}
            required
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
          />{" "}
          {tr("Показывать в публичной афише")}
        </label>
        <EventDocumentsUploader
          value={form.documents}
          onChange={(documents) => set("documents", documents)}
          disabled={busy || uploading}
          onBusyChange={(value) => {
            documentBusy.current = value;
            setDocumentsUploading(value);
          }}
        />
        {error && <ErrorBox>{tr(error)}</ErrorBox>}
        <button
          disabled={busy || uploading || documentsUploading}
          className="btn btn-primary full-width"
        >
          {tr(busy ? "Сохраняем…" : "Сохранить мероприятие")}
          <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}
function PromoEditor() {
  const { notify } = useApp();
  const [promo, setPromo] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/promo")
      .then(setPromo)
      .catch((e) => setError(e.message));
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/promo", { method: "PUT", body: JSON.stringify(promo) });
      notify("Рекламный блок обновлён");
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-panel">
      <div className="workspace-heading">
        <div>
          <h2>{tr("Рекламный блок")}</h2>
          <p>{tr("Редактируйте предложение на главной странице.")}</p>
        </div>
      </div>
      <div className="promo-editor">
        {error && <ErrorBox>{tr(error)}</ErrorBox>}
        {promo ? (
          <form onSubmit={save}>
            {[
              ["eyebrow", "Надпись над заголовком"],
              ["title", "Заголовок"],
              ["subtitle", "Подзаголовок"],
              ["button", "Текст кнопки"],
              ["href", "Ссылка (https://… или #events)"],
            ].map(([k, t]) => (
              <label className="field" key={k}>
                <span>{tr(t)}</span>
                <input
                  required
                  minLength={2}
                  maxLength={k === "href" ? 300 : 160}
                  value={promo[k]}
                  onChange={(e) =>
                    setPromo((p) => ({ ...p, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={promo.active}
                onChange={(e) =>
                  setPromo((p) => ({ ...p, active: e.target.checked }))
                }
              />{" "}
              {tr("Показывать рекламный блок")}
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {tr(busy ? "Сохраняем…" : "Сохранить")}
              <Check size={17} />
            </button>
          </form>
        ) : (
          !error && <Spinner />
        )}
      </div>
    </div>
  );
}
