import { tr, getIntlLocale } from "../i18n/runtime.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Medal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { api, dateLabel, ErrorBox, Modal, Spinner, useApp } from "../main";
import CabinetSidebar from "../components/CabinetSidebar";
import {
  AWARD_SUBJECTS,
  MAX_SCORE,
  categoryLabel,
} from "../../shared/award-rules.js";
import "./AwardsPage.css";

const draftKey = (id) => `iqland:award-scores:${id}`;
const validScore = (value) =>
  value.trim() === "" ||
  (Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= MAX_SCORE);
const scoreValue = (value) => (value.trim() === "" ? null : Number(value));
const ageText = (age) =>
  age === null
    ? "Проверьте дату рождения"
    : categoryLabel({ minAge: age, maxAge: age });

export default function AwardsPage() {
  const { user, setUser, authReady, notify } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null),
    [eventId, setEventId] = useState(""),
    [data, setData] = useState(null);
  const [subject, setSubject] = useState(AWARD_SUBJECTS[0]),
    [query, setQuery] = useState("");
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0);
  const [drafts, setDrafts] = useState({}),
    [saving, setSaving] = useState(0),
    [generating, setGenerating] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false),
    [downloading, setDownloading] = useState(""),
    [leaveTo, setLeaveTo] = useState(null);
  const state = useRef(null),
    edits = useRef({}),
    queue = useRef(Promise.resolve()),
    generation = useRef(0);
  const mounted = useRef(true);
  state.current = data;
  edits.current = drafts;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const apply = (value) => {
    state.current = value;
    setData(value);
  };
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    api("/awards", { signal: controller.signal })
      .then((list) => {
        if (controller.signal.aborted) return;
        setEvents(list);
        setEventId((id) =>
          list.some((e) => e.id === id) ? id : list[0]?.id || "",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e.status === 401) setUser(null);
          else setError(e.message);
        }
      });
    return () => controller.abort();
  }, [user, reload]);
  useEffect(() => {
    if (!eventId || !user) return;
    const controller = new AbortController();
    generation.current++;
    setLoading(true);
    setError("");
    setQuery("");
    api("/awards/" + eventId, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        let restored = {};
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(draftKey(eventId)) || "{}",
          );
          const ids = new Set(value.rows.map((r) => r.id));
          if (saved && typeof saved === "object" && !Array.isArray(saved))
            restored = Object.fromEntries(
              Object.entries(saved).filter(
                ([id, score]) =>
                  ids.has(id) &&
                  typeof score === "string" &&
                  score.length <= 32 &&
                  String(value.rows.find((r) => r.id === id).score ?? "") !==
                    score,
              ),
            );
        } catch {}
        edits.current = restored;
        setDrafts(restored);
        apply(value);
        setSubject((current) =>
          value.event.subjects.includes(current)
            ? current
            : AWARD_SUBJECTS.find((s) => value.event.subjects.includes(s)) ||
              AWARD_SUBJECTS[0],
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e.status === 401) setUser(null);
          else setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [eventId, user, reload]);
  useEffect(() => {
    if (!data) return;
    try {
      if (Object.keys(drafts).length)
        sessionStorage.setItem(draftKey(data.event.id), JSON.stringify(drafts));
      else sessionStorage.removeItem(draftKey(data.event.id));
    } catch {}
  }, [drafts, data?.event.id]);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const unload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [drafts]);

  function saveScores(ids) {
    const task = async () => {
      const current = state.current;
      if (!current) return;
      const selected = (ids || Object.keys(edits.current)).filter((id) =>
        Object.hasOwn(edits.current, id),
      );
      if (!selected.length) return current;
      const captured = Object.fromEntries(
        selected.map((id) => [id, edits.current[id]]),
      );
      if (Object.values(captured).some((value) => !validScore(value)))
        throw Error("Проверьте баллы: введите число от 0 до 1 000 000.");
      const rows = new Map(current.rows.map((r) => [r.id, r]));
      const payload = selected.map((id) => ({
        id,
        score: scoreValue(captured[id]),
        previous: rows.get(id)?.score,
      }));
      const gen = generation.current;
      setSaving((n) => n + 1);
      try {
        const saved = await api(`/awards/${current.event.id}/scores`, {
          method: "PUT",
          body: JSON.stringify({ scores: payload }),
        });
        if (!mounted.current || generation.current !== gen) return saved;
        apply(saved);
        setDrafts((previous) => {
          const next = { ...previous };
          for (const [id, value] of Object.entries(captured))
            if (next[id] === value) delete next[id];
          edits.current = next;
          return next;
        });
        setError("");
        return saved;
      } catch (e) {
        if (e.status === 401) setUser(null);
        if (e.status === 409 && mounted.current && generation.current === gen) {
          const fresh = await api(`/awards/${current.event.id}`).catch(
            () => null,
          );
          if (fresh && mounted.current && generation.current === gen)
            apply(fresh);
        }
        throw e;
      } finally {
        if (mounted.current) setSaving((n) => n - 1);
      }
    };
    queue.current = queue.current.catch(() => {}).then(task);
    return queue.current;
  }
  const saveBeforeLeave = async () => {
    try {
      await saveScores();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };
  async function generate() {
    setGenerating(true);
    setError("");
    try {
      await saveScores();
      const current = state.current;
      const saved = await api(`/awards/${current.event.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ expectedHash: current.inputHash }),
      });
      apply(saved);
      notify("Места присвоены. Файлы центров готовы.");
      requestAnimationFrame(() =>
        document.getElementById("center-results")?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }
  async function download(center) {
    setDownloading(center.id);
    setError("");
    try {
      const response = await fetch(
        `/api/awards/${eventId}/centers/${center.id}/export`,
        {
          credentials: "same-origin",
          headers: { "Accept-Language": getIntlLocale() },
        },
      );
      if (!response.ok) {
        if (response.status === 401) setUser(null);
        throw Error(
          (await response.json().catch(() => ({}))).error ||
            "Не удалось скачать Excel.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `IQ LAND — ${center.name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100)}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading("");
    }
  }
  const effective = useMemo(
    () =>
      (data?.rows || []).map((row) => {
        const text = Object.hasOwn(drafts, row.id)
          ? drafts[row.id]
          : String(row.score ?? "");
        return {
          ...row,
          text,
          valid: validScore(text),
          effectiveScore: validScore(text) ? scoreValue(text) : null,
        };
      }),
    [data, drafts],
  );
  const visible = effective.filter(
    (row) =>
      row.subject === subject &&
      (!query.trim() ||
        [row.name, row.center, row.city]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru"))),
  );
  const remaining = effective.filter((r) => r.effectiveScore === null).length;
  const dirty = Object.keys(drafts).length > 0;
  const stale = data?.result && (data.result.stale || dirty);
  if (!authReady) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <main className="dashboard-page awards-page">
      <div className="container dashboard-layout">
        <CabinetSidebar active="awards" beforeLeave={saveBeforeLeave} />
        <section className="dashboard-content aw-content">
          <header className="aw-heading">
            <div>
              <span className="eyebrow">{tr("ИТОГИ ОЛИМПИАДЫ")}</span>
              <h1>{tr("Присвоение мест")}</h1>
              <p>
                {tr(
                  "Каждый предмет. Своя возрастная категория. Честные результаты.",
                )}
              </p>
            </div>
            <span className="aw-heading-symbol" aria-hidden="true">
              <Medal size={30} strokeWidth={1.4} />
            </span>
          </header>
          {error && <ErrorBox>{tr(error)}</ErrorBox>}
          {!events ? (
            error ? (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setError("");
                  setReload((n) => n + 1);
                }}
              >
                {tr("Повторить загрузку")}
              </button>
            ) : (
              <Spinner />
            )
          ) : !events.length ? (
            <div className="workspace-panel aw-empty">
              <CalendarDays size={36} />
              <h2>{tr("Олимпиада ещё впереди")}</h2>
              <p>
                {tr(
                  "Здесь появятся мероприятия, которые проходят сегодня или уже завершились.",
                )}
              </p>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  navigate("/cabinet", { state: { section: "events" } })
                }
              >
                {tr("К мероприятиям ")}
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="aw-event-bar">
                <CalendarDays size={22} />
                <label>
                  <span>{tr("ОЛИМПИАДА")}</span>
                  <select
                    aria-label={tr("Олимпиада для присвоения мест")}
                    value={eventId}
                    disabled={saving > 0 || generating}
                    onChange={async (event) => {
                      const next = event.target.value;
                      try {
                        await saveBeforeLeave();
                        setEventId(next);
                      } catch {}
                    }}
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {tr(event.title)} · {tr(event.city)} ·{" "}
                        {tr(dateLabel(event.date))}
                      </option>
                    ))}
                  </select>
                </label>
                <ChevronDown size={18} />
              </div>
              {loading || !data || data.event.id !== eventId ? (
                !loading && error ? (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setReload((n) => n + 1)}
                  >
                    {tr("Повторить загрузку")}
                  </button>
                ) : (
                  <Spinner />
                )
              ) : (
                <>
                  <div className="aw-toolbar">
                    <span>
                      {tr(
                        data.event.date ===
                          new Date().toISOString().slice(0, 10)
                          ? "Проходит сегодня"
                          : dateLabel(data.event.date),
                      )}
                      <i />
                      {data.summary.participants}
                      {tr(" учеников · ")}
                      {data.rows.length} {tr("участий")}
                    </span>
                    <div className="aw-toolbar-actions">
                      <button
                        className="aw-settings aw-refresh"
                        aria-label={tr("Обновить список участников")}
                        title={tr("Обновить список участников")}
                        disabled={saving > 0 || generating}
                        onClick={async () => {
                          try {
                            await saveBeforeLeave();
                            setReload((n) => n + 1);
                          } catch {}
                        }}
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        className="aw-settings"
                        disabled={saving > 0 || generating}
                        onClick={() => setCategoriesOpen(true)}
                      >
                        <Settings2 size={17} />
                        {tr("Возрастные категории")}
                      </button>
                    </div>
                  </div>
                  {!data.categories.length && (
                    <div className="aw-setup">
                      <div>
                        <strong>
                          {tr("Сначала задайте возрастные категории")}
                        </strong>
                        <p>
                          {tr(
                            "Например, 12–13 и 14–15 лет. Возраст считаем на дату олимпиады; дети из разных категорий не соревнуются между собой.",
                          )}
                        </p>
                      </div>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => setCategoriesOpen(true)}
                      >
                        {tr("Настроить ")}
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                  {data.summary.uncategorized > 0 &&
                    data.categories.length > 0 && (
                      <div className="aw-warning">
                        {tr("Не попали в возрастные диапазоны:")}{" "}
                        {tr(data.summary.uncategorized)}
                        {tr(" участий. Дополните категории перед расчётом.")}
                      </div>
                    )}
                  <div className="aw-panel">
                    <nav
                      className="aw-tabs"
                      role="tablist"
                      aria-label={tr("Предметы олимпиады")}
                    >
                      {AWARD_SUBJECTS.map((name, i) => (
                        <button
                          key={name}
                          role="tab"
                          id={`aw-tab-${i}`}
                          aria-label={tr(name)}
                          aria-selected={subject === name}
                          aria-controls="aw-roster"
                          tabIndex={subject === name ? 0 : -1}
                          disabled={!data.event.subjects.includes(name)}
                          onClick={() => {
                            setSubject(name);
                            setQuery("");
                          }}
                          onKeyDown={(e) => {
                            if (
                              ![
                                "ArrowLeft",
                                "ArrowRight",
                                "Home",
                                "End",
                              ].includes(e.key)
                            )
                              return;
                            e.preventDefault();
                            const tabs = [
                              ...e.currentTarget.parentElement.querySelectorAll(
                                "button:not(:disabled)",
                              ),
                            ];
                            const index = tabs.indexOf(e.currentTarget);
                            const next =
                              e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? tabs.length - 1
                                  : (index +
                                      (e.key === "ArrowRight" ? 1 : -1) +
                                      tabs.length) %
                                    tabs.length;
                            tabs[next].click();
                            tabs[next].focus();
                          }}
                        >
                          {tr(name)}
                          <span>
                            {effective.filter((r) => r.subject === name).length}
                          </span>
                        </button>
                      ))}
                    </nav>
                    <div className="aw-list-toolbar">
                      <label className="aw-search">
                        <Search size={17} />
                        <input
                          aria-label={tr("Поиск ученика или центра")}
                          placeholder={tr("Ученик или образовательный центр")}
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <span className="aw-save-state" role="status">
                        {tr(
                          saving ? (
                            <>
                              <RefreshCw size={14} className="spin" />
                              {tr("Сохраняю баллы")}
                            </>
                          ) : dirty ? (
                            "Есть несохранённые баллы"
                          ) : (
                            <>
                              <Check size={15} />
                              {tr("Баллы сохранены")}
                            </>
                          ),
                        )}
                      </span>
                    </div>
                    <div
                      id="aw-roster"
                      role="tabpanel"
                      aria-labelledby={`aw-tab-${AWARD_SUBJECTS.indexOf(subject)}`}
                      className="aw-roster"
                    >
                      {visible.length ? (
                        <table className="aw-table">
                          <thead>
                            <tr>
                              <th>{tr("Ученик")}</th>
                              <th>{tr("Образовательный центр")}</th>
                              <th>{tr("Баллы")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((row, i) => (
                              <React.Fragment key={row.id}>
                                {(i === 0 ||
                                  row.age !== visible[i - 1].age) && (
                                  <tr className="aw-age-row">
                                    <th colSpan={3}>
                                      <strong>{tr(ageText(row.age))}</strong>
                                      <span>
                                        {tr(
                                          row.categoryId
                                            ? `Категория ${row.categoryLabel}`
                                            : "Категория не задана",
                                        )}
                                      </span>
                                    </th>
                                  </tr>
                                )}
                                <tr className="aw-student-row">
                                  <td>
                                    <strong>{row.name}</strong>
                                    <small>
                                      {tr(
                                        row.grade === 0
                                          ? "Дошкольник"
                                          : `${row.grade} класс`,
                                      )}
                                    </small>
                                  </td>
                                  <td>
                                    <span>{row.center}</span>
                                    <small>{tr(row.city)}</small>
                                  </td>
                                  <td>
                                    <input
                                      className={
                                        "aw-score-input" +
                                        (!row.valid ? " invalid" : "")
                                      }
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      max={MAX_SCORE}
                                      step="any"
                                      placeholder="—"
                                      aria-label={tr("Баллы {0}, {1}", [
                                        row.name,
                                        row.subject,
                                      ])}
                                      aria-invalid={!row.valid}
                                      disabled={generating}
                                      value={row.text}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setDrafts((previous) => {
                                          const next = {
                                            ...previous,
                                            [row.id]: value,
                                          };
                                          edits.current = next;
                                          return next;
                                        });
                                      }}
                                      onBlur={() =>
                                        saveScores([row.id]).catch((e) =>
                                          setError(e.message),
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          const inputs = [
                                            ...document.querySelectorAll(
                                              ".aw-score-input",
                                            ),
                                          ];
                                          const next =
                                            inputs[
                                              inputs.indexOf(
                                                event.currentTarget,
                                              ) + 1
                                            ];
                                          event.currentTarget.blur();
                                          next?.focus();
                                        }
                                      }}
                                    />
                                  </td>
                                </tr>
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="aw-empty aw-empty-small">
                          <p>
                            {tr(
                              query
                                ? "Участники не найдены. Измените поиск."
                                : "По этому предмету пока нет участников.",
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                    <footer className="aw-completion">
                      <div>
                        <strong>
                          {tr("Заполнено ")}
                          {tr(effective.length - remaining)}
                          {tr(" из")} {effective.length}
                        </strong>
                        <span>
                          {tr(
                            "По всем предметам олимпиады. Пустое поле — без баллов, 0 — результат.",
                          )}
                        </span>
                        <div className="aw-progress">
                          <span
                            style={{
                              width: `${effective.length ? ((effective.length - remaining) / effective.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="aw-completion-actions">
                        <button
                          className="btn btn-secondary btn-small"
                          disabled={!dirty || saving > 0 || generating}
                          onClick={() => saveBeforeLeave().catch(() => {})}
                        >
                          {tr("Сохранить баллы")}
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={
                            generating ||
                            !effective.length ||
                            remaining > 0 ||
                            !data.categories.length ||
                            data.summary.uncategorized > 0
                          }
                          onClick={generate}
                        >
                          {tr(
                            generating ? "Рассчитываю…" : "Вывести результаты",
                          )}
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </footer>
                  </div>
                  <details className="aw-rules">
                    <summary>{tr("Как распределяются награды")}</summary>
                    <p>
                      {tr(
                        "В каждом предмете и возрастной категории отдельно: верхние 30% — золото, следующие 30% — серебро, остальные — бронза. Границы 30% и 60% округляются вверх. При одинаковых баллах присваивается одинаковая, более высокая награда: поэтому фактические доли могут отличаться от 30/30/40. Образовательный центр на расчёт места не влияет.",
                      )}
                    </p>
                  </details>
                  {data.result && (
                    <section
                      className={"aw-results" + (stale ? " is-stale" : "")}
                      id="center-results"
                      aria-labelledby="center-results-title"
                    >
                      <div className="aw-results-heading">
                        <div>
                          <span className="eyebrow">
                            {tr("РЕЗУЛЬТАТЫ ПО ЦЕНТРАМ")}
                          </span>
                          <h2 id="center-results-title">
                            {tr("Готово. Каждый центр —")}
                            <br />
                            {tr("в отдельном файле.")}
                          </h2>
                        </div>
                        <span
                          className={
                            "aw-result-status" + (stale ? " stale" : "")
                          }
                        >
                          {tr(
                            stale ? "Нужен пересчёт" : "Результаты рассчитаны",
                          )}
                        </span>
                      </div>
                      {stale && (
                        <div className="aw-warning">
                          {tr(
                            "Баллы, категории или список участников изменились. Нажмите «Вывести результаты», чтобы обновить награды и файлы.",
                          )}
                        </div>
                      )}
                      <div className="aw-medal-summary">
                        {[
                          ["gold", "Золото"],
                          ["silver", "Серебро"],
                          ["bronze", "Бронза"],
                        ].map(([key, name]) => (
                          <span className={"aw-medal " + key} key={key}>
                            <Medal size={17} />
                            {tr(name)}
                            <strong>{tr(data.result.counts[key])}</strong>
                          </span>
                        ))}
                      </div>
                      <div className="aw-center-list">
                        {data.result.centers.map((center) => (
                          <article className="aw-center" key={center.id}>
                            <span className="aw-file-icon">
                              <FileSpreadsheet size={24} strokeWidth={1.5} />
                            </span>
                            <div>
                              <h3>{center.name}</h3>
                              <p>
                                {tr(center.city)} · {center.participants}
                                {tr(" учеников ·")} {center.entries}
                                {tr(" результатов")}
                              </p>
                              <div className="aw-center-medals">
                                <span className="gold">
                                  {tr("Золото ")}
                                  {center.gold}
                                </span>
                                <span>
                                  {tr("Серебро ")}
                                  {center.silver}
                                </span>
                                <span className="bronze">
                                  {tr("Бронза ")}
                                  {center.bronze}
                                </span>
                              </div>
                            </div>
                            <button
                              className="btn btn-secondary btn-small"
                              disabled={
                                stale ||
                                Boolean(downloading) ||
                                generating ||
                                saving > 0
                              }
                              onClick={() => download(center)}
                            >
                              <Download size={17} />
                              {tr(
                                downloading === center.id
                                  ? "Готовлю…"
                                  : "Скачать Excel",
                              )}
                            </button>
                          </article>
                        ))}
                      </div>
                      <p className="aw-export-note">
                        {tr(
                          "В файле сначала идут золото, серебро и бронза, затем — предметы и возрастные категории. Файлы доступны только организаторам.",
                        )}
                      </p>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {categoriesOpen && data && (
            <CategoriesEditor
              data={data}
              onClose={() => setCategoriesOpen(false)}
              onSave={async (categories) => {
                await saveScores();
                const value = await api(`/awards/${eventId}/categories`, {
                  method: "PUT",
                  body: JSON.stringify({ categories }),
                });
                apply(value);
                setCategoriesOpen(false);
              }}
            />
          )}
          {leaveTo && (
            <Modal
              title={tr("Сохранить баллы перед переходом?")}
              onClose={() => setLeaveTo(null)}
            >
              <p>
                {tr(
                  "Сохраните введённые баллы, чтобы продолжить работу с ними позже.",
                )}
              </p>
              <div className="aw-leave-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const to = leaveTo;
                    setLeaveTo(null);
                    navigate(to);
                  }}
                >
                  {tr("Перейти с черновиком")}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await saveBeforeLeave();
                      const to = leaveTo;
                      setLeaveTo(null);
                      navigate(to);
                    } catch {}
                  }}
                >
                  {tr("Сохранить и перейти")}
                </button>
              </div>
            </Modal>
          )}
        </section>
      </div>
    </main>
  );
}

function CategoriesEditor({ data, onClose, onSave }) {
  const [items, setItems] = useState(() =>
    data.categories.length
      ? data.categories.map((c) => ({
          minAge: String(c.minAge),
          maxAge: String(c.maxAge),
        }))
      : [...new Set(data.rows.map((r) => r.age).filter((age) => age !== null))]
          .sort((a, b) => a - b)
          .map((age) => ({ minAge: String(age), maxAge: String(age) })),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={tr("Возрастные категории")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="aw-category-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setError("");
          if (
            !items.length ||
            items.some((c) => c.minAge === "" || c.maxAge === "")
          ) {
            setError("Заполните обе границы каждой категории.");
            return;
          }
          setBusy(true);
          try {
            await onSave(
              items.map((c) => ({
                minAge: Number(c.minAge),
                maxAge: Number(c.maxAge),
              })),
            );
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <p>
          {tr(
            "Полный возраст на дату олимпиады. Диапазоны включают обе границы и не должны пересекаться: например, 12–13 и 14–15 лет.",
          )}
        </p>
        {error && <ErrorBox>{tr(error)}</ErrorBox>}
        <div className="aw-category-items">
          {items.map((category, index) => (
            <div className="aw-category-row" key={index}>
              <label>
                <span>{tr("От")}</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  aria-label={tr("Минимальный возраст категории {0}", [
                    index + 1,
                  ])}
                  value={category.minAge}
                  disabled={busy}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((c, i) =>
                        i === index ? { ...c, minAge: e.target.value } : c,
                      ),
                    )
                  }
                />
              </label>
              <span>—</span>
              <label>
                <span>{tr("До включительно")}</span>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  aria-label={tr("Максимальный возраст категории {0}", [
                    index + 1,
                  ])}
                  value={category.maxAge}
                  disabled={busy}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((c, i) =>
                        i === index ? { ...c, maxAge: e.target.value } : c,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="icon-btn"
                type="button"
                aria-label={tr("Удалить категорию {0}", [index + 1])}
                disabled={busy}
                onClick={() =>
                  setItems((list) => list.filter((_, i) => i !== index))
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="text-link"
          type="button"
          disabled={busy || items.length >= 100}
          onClick={() =>
            setItems((list) => [...list, { minAge: "", maxAge: "" }])
          }
        >
          <Plus size={17} />
          {tr("Добавить категорию")}
        </button>
        <button
          className="btn btn-primary full-width"
          type="submit"
          disabled={busy}
        >
          {tr(busy ? "Сохраняю…" : "Сохранить категории")}
          <Check size={18} />
        </button>
      </form>
    </Modal>
  );
}
