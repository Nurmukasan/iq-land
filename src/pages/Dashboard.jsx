import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
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
        <span className="eyebrow">КОМАНДА IQ LAND</span>
        <h1>
          За каждым открытием —<br />
          <span className="serif-text">люди, которые верят.</span>
        </h1>
        <p>
          Ваше рабочее пространство для управления олимпиадами, заявками и
          результатами.
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
        <h2>С возвращением</h2>
        <p>Войдите в кабинет организатора</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="Ваш рабочий email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <div className="password-field">
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Введите пароль"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn btn-primary full-width" disabled={busy}>
            {busy ? "Входим…" : "Войти в кабинет"}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="login-help">
          <ShieldCheck size={16} />
          <span>
            Доступ для администратора и руководителя.
            <br />
            Данные входа выдаёт администратор сайта.
          </span>
        </div>
        <Link to="/" className="back-link">
          <ArrowLeft size={15} /> Вернуться на сайт
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
  const { user, setUser, authReady, notify } = useApp();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("registrations"),
    [eventId, setEventId] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [subject, setSubject] = useState(""),
    [grade, setGrade] = useState(""),
    [detail, setDetail] = useState(null),
    [editing, setEditing] = useState(null),
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
      (!Number.isFinite(score) || score < 0 || score > 100)
    ) {
      notify("Укажите баллы от 0 до 100");
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
        <aside className="dashboard-sidebar">
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <div className="user-card">
            <div>{user.name[0]}</div>
            <strong>
              {user.name}
              <small>
                {user.role === "admin"
                  ? "Администратор сайта"
                  : "Руководитель IQ LAND"}
              </small>
            </strong>
          </div>
          <nav aria-label="Разделы кабинета">
            {[
              { id: "registrations", title: "Заявки команд", icon: Users },
              { id: "protocol", title: "Протокол олимпиады", icon: ListChecks },
              ...(user.role === "admin"
                ? [
                    { id: "events", title: "Мероприятия", icon: CalendarDays },
                    { id: "promo", title: "Рекламный блок", icon: Trophy },
                  ]
                : []),
            ].map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                onClick={() => {
                  setTab(t.id);
                  setQuery("");
                  setError("");
                }}
              >
                <t.icon size={18} />
                {t.title}
                <ChevronRight size={15} />
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <ShieldCheck size={22} />
            <p>
              Все заявки и результаты
              <br />в одном пространстве.
            </p>
            <button
              className="text-link small"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              <LogOut size={15} /> Выйти из кабинета
            </button>
          </div>
        </aside>
        <section className="dashboard-content">
          <div className="dashboard-title">
            <div>
              <span className="eyebrow">КАБИНЕТ ОРГАНИЗАТОРА</span>
              <h1>
                Всё под контролем<span>.</span>
              </h1>
            </div>
            <button
              className="btn btn-primary btn-small"
              disabled={!data || exporting}
              title="Три листа: участники, протокол и учителя. Экспорт всех данных выбранной олимпиады."
              onClick={exportExcel}
            >
              <Download size={17} />
              {exporting ? "Готовим файл…" : "Скачать Excel"}
            </button>
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          {!data ? (
            busy ? (
              <Spinner />
            ) : (
              <button className="btn btn-secondary" onClick={load}>
                Повторить загрузку
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
                      {s.label}
                      <s.icon size={18} />
                    </span>
                    <strong>{s.value.toString().padStart(2, "0")}</strong>
                  </div>
                ))}
              </div>
              {(tab === "registrations" || tab === "protocol") && (
                <div className="workspace-panel">
                  <div className="workspace-heading">
                    <div>
                      <h2>
                        {tab === "registrations"
                          ? "Заявки команд"
                          : "Протокол олимпиады"}
                      </h2>
                      <p>
                        {tab === "registrations"
                          ? "Новые заявки появляются здесь после отправки формы."
                          : "Сортировка по олимпиаде, дисциплине, классу, баллам и имени."}
                      </p>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={load}
                      disabled={busy}
                      aria-label="Обновить данные"
                    >
                      <RefreshCw size={18} className={busy ? "spin" : ""} />
                    </button>
                  </div>
                  <div className="workspace-filters">
                    <label className="search-input">
                      <Search size={16} />
                      <input
                        placeholder={
                          tab === "registrations"
                            ? "Центр, учитель или номер…"
                            : "Ученик, центр или учитель…"
                        }
                        aria-label="Поиск"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Олимпиада"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                    >
                      <option value="">Все олимпиады</option>
                      {data.events.map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.city} · {dateLabel(e.date)}
                        </option>
                      ))}
                    </select>
                    {tab === "registrations" ? (
                      <select
                        aria-label="Статус заявки"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">Все статусы</option>
                        {Object.entries(statusNames).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select
                          aria-label="Дисциплина"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          <option value="">Все дисциплины</option>
                          {[
                            "Английский язык",
                            "Математика",
                            "Ментальная арифметика",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <select
                          aria-label="Класс"
                          value={grade}
                          onChange={(e) => setGrade(e.target.value)}
                        >
                          <option value="">Все классы</option>
                          {Array.from({ length: 13 }, (_, i) => (
                            <option key={i} value={i}>
                              {i === 0 ? "Дошкольники" : i + " класс"}
                            </option>
                          ))}
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
                              <th>Команда / центр</th>
                              <th>Олимпиада</th>
                              <th>Ученики</th>
                              <th>Статус</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {registrations.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <strong>{r.center}</strong>
                                  <small>
                                    {r.teacher} · {r.city}
                                  </small>
                                  <small className="registration-code">
                                    {r.id}
                                  </small>
                                </td>
                                <td>
                                  {
                                    data.events.find((e) => e.id === r.event_id)
                                      ?.city
                                  }
                                  <small>
                                    {dateLabel(
                                      data.events.find(
                                        (e) => e.id === r.event_id,
                                      ).date,
                                    )}
                                  </small>
                                </td>
                                <td>
                                  <span className="number-pill">
                                    {r.student_count}
                                  </span>
                                </td>
                                <td>
                                  <select
                                    className={
                                      "status-select status-" + r.status
                                    }
                                    aria-label={"Статус заявки " + r.id}
                                    value={r.status}
                                    onChange={(e) =>
                                      changeStatus(r.id, e.target.value)
                                    }
                                  >
                                    {Object.entries(statusNames).map(
                                      ([k, v]) => (
                                        <option key={k} value={k}>
                                          {v}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </td>
                                <td>
                                  <button
                                    className="icon-btn"
                                    onClick={() => setDetail(r)}
                                    aria-label={"Открыть заявку " + r.id}
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
                          {query || eventId || status
                            ? "Заявки не найдены"
                            : "Здесь появится ваша первая команда"}
                        </h3>
                        <p>
                          {query || eventId || status
                            ? "Попробуйте изменить условия поиска."
                            : "Отправленные учителем заявки автоматически попадут в этот список."}
                        </p>
                        <Link to="/#events" className="text-link">
                          Перейти к афише <ArrowUpRight size={17} />
                        </Link>
                      </div>
                    )
                  ) : entries.length ? (
                    <div className="manage-table-wrap">
                      <table className="manage-table protocol-table">
                        <thead>
                          <tr>
                            <th>Участник</th>
                            <th>Дисциплина / класс</th>
                            <th>Баллы</th>
                            <th>Место</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.name}</strong>
                                <small>
                                  {r.center} · {r.event_city}
                                </small>
                              </td>
                              <td>
                                {r.subject}
                                <small>
                                  {r.grade === 0
                                    ? "Дошкольник"
                                    : r.grade + " класс"}
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
                                  {place(r)}
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
                      <h3>Протокол пока пуст</h3>
                      <p>
                        Участники появятся после первой заявки. Отменённые
                        заявки в протокол не включаются.
                      </p>
                    </div>
                  )}
                  <div className="table-bottom">
                    <span>
                      {tab === "registrations"
                        ? `Найдено заявок: ${registrations.length}`
                        : `Участий в дисциплинах: ${entries.length}`}
                    </span>
                    <span>
                      {tab === "protocol"
                        ? "Баллы сохраняются после выхода из поля. Равные баллы — равное место."
                        : "Автообновление каждые 15 секунд. Отменённые заявки сохраняются в списке."}
                    </span>
                  </div>
                </div>
              )}
              {tab === "events" && (
                <div className="workspace-panel">
                  <div className="workspace-heading">
                    <div>
                      <h2>Мероприятия</h2>
                      <p>Афиша, программа, стоимость и сроки регистрации.</p>
                    </div>
                    <button
                      className="btn btn-primary btn-small"
                      onClick={() => setEditing({})}
                    >
                      <Plus size={16} /> Добавить
                    </button>
                  </div>
                  <div className="event-manage-list">
                    {data.events.map((e) => (
                      <div key={e.id}>
                        <img src={e.image} alt={e.city} />
                        <div>
                          <h3>
                            {e.flag} {e.city}, {e.country}
                          </h3>
                          <p>
                            {dateLabel(e.date)} · {priceLabel(e)}
                          </p>
                          <span
                            className={
                              "availability-pill " +
                              (!e.active ? "inactive" : "")
                            }
                          >
                            {e.active ? "Опубликовано" : "Скрыто из афиши"}
                          </span>
                        </div>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => setEditing(e)}
                        >
                          <Pencil size={15} /> Изменить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === "promo" && <PromoEditor />}
            </>
          )}
        </section>
      </div>
      {detail && (
        <Modal
          title={"Заявка " + detail.id}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-center">
            <Building2 size={25} />
            <div>
              <h3>{detail.center}</h3>
              <p>
                {detail.city} ·{" "}
                {data.events.find((e) => e.id === detail.event_id)?.city}
              </p>
            </div>
            <span className={"status-tag status-" + detail.status}>
              {statusNames[detail.status]}
            </span>
          </div>
          <div className="review-grid">
            <div>
              <small>Ответственный учитель</small>
              <strong>{detail.teacher}</strong>
            </div>
            <div>
              <small>Контакты</small>
              <strong>{detail.phone}</strong>
              <span>{detail.email}</span>
            </div>
          </div>
          <h4>Ученики</h4>
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
                <span className="row-number">{i + 1}</span>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.birth.split("-").reverse().join(".")} ·{" "}
                    {r.grade === 0 ? "Дошкольник" : r.grade + " класс"}
                  </small>
                </div>
                <span>{r.subjects.join(", ")}</span>
              </div>
            ))}
          </div>
          <h4>Дополнительные сертификаты педагогам</h4>
          <p>{detail.teachers.join(", ") || "Не запрошены"}</p>
          {detail.note && (
            <>
              <h4>Комментарий</h4>
              <p>{detail.note}</p>
            </>
          )}
          <p className="muted small">
            Получена: {new Date(detail.created).toLocaleString("ru-RU")}
          </p>
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
    </main>
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
      max="100"
      step="0.5"
      aria-label={"Баллы " + row.name + ", " + row.subject}
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
      image: "/images/baku.png",
      description: "",
      active: true,
      ...event,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/events" + (event.id ? "/" + event.id : ""), {
        method: event.id ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          price:
            form.price === "" || form.price === null
              ? null
              : Number(form.price),
        }),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={event.id ? "Изменить мероприятие" : "Новая олимпиада"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
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
              <span>{label}</span>
              <input
                type={type}
                required
                minLength={type === "text" && k !== "flag" ? 2 : undefined}
                maxLength={k === "flag" ? 8 : 150}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          <label className="field">
            <span>Стоимость · пусто, если уточняется</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.price ?? ""}
              onChange={(e) => set("price", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Валюта</span>
            <select
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {["KZT", "USD", "AZN"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field span-two">
            <span>Иллюстрация</span>
            <select
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
            >
              <option value="/images/baku.png">Баку</option>
              <option value="/images/almaty.png">Алматы</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Дисциплины</span>
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
                {s}
              </label>
            ),
          )}
        </div>
        <label className="field">
          <span>Программа · один пункт на строку</span>
          <textarea
            rows={4}
            required
            value={form.includes.join("\n")}
            onChange={(e) => set("includes", e.target.value.split("\n"))}
          />
        </label>
        <label className="field">
          <span>Описание</span>
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
          Показывать в публичной афише
        </label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button disabled={busy} className="btn btn-primary full-width">
          {busy ? "Сохраняем…" : "Сохранить мероприятие"}
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
          <h2>Рекламный блок</h2>
          <p>Редактируйте предложение на главной странице.</p>
        </div>
      </div>
      <div className="promo-editor">
        {error && <ErrorBox>{error}</ErrorBox>}
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
                <span>{t}</span>
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
              Показывать рекламный блок
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
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
