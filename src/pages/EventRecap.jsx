import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  MapPin,
  Search,
  Trophy,
} from "lucide-react";
import { api, dateLabel, priceLabel, ErrorBox, Spinner } from "../main";
import MontagePlayer from "../components/MontagePlayer";
import "./Archive.css";

const gradeLabel = (grade) => (grade === 0 ? "Дошкольники" : `${grade} класс`);
const scoreFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 20,
});

export default function EventRecap() {
  const { id } = useParams();
  const { hash } = useLocation();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const [subject, setSubject] = useState(""),
    [grade, setGrade] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    setSubject("");
    setGrade("");
    setQuery("");
    api("/archive/" + id, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reload]);
  useEffect(() => {
    const previous = document.title;
    if (data) document.title = data.event.title + " · Итоги · IQ LAND";
    return () => {
      document.title = previous;
    };
  }, [data]);
  useEffect(() => {
    if (loading || !data || hash !== "#results") return;
    const frame = requestAnimationFrame(() => {
      document.getElementById("results")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, loading, hash]);
  const results = data?.results || [];
  const visible = useMemo(
    () =>
      results.filter(
        (r) =>
          (!subject || r.subject === subject) &&
          (grade === "" || String(r.grade) === grade) &&
          (!query.trim() ||
            r.name
              .toLocaleLowerCase("ru-RU")
              .includes(query.trim().toLocaleLowerCase("ru-RU"))),
      ),
    [results, subject, grade, query],
  );
  if (loading)
    return (
      <main className="container recap-page">
        <Spinner />
      </main>
    );
  if (error || !data)
    return (
      <main className="container recap-page archive-error">
        <Link className="back-link" to="/archive">
          <ArrowLeft size={16} /> Все прошедшие олимпиады
        </Link>
        <ErrorBox>{error || "Олимпиада не найдена"}</ErrorBox>
        <button
          className="btn btn-secondary"
          onClick={() => setReload((v) => v + 1)}
        >
          Повторить загрузку
        </button>
      </main>
    );
  const event = data.event;
  return (
    <main className="container recap-page">
      <Link className="back-link" to="/archive">
        <ArrowLeft size={16} /> Все прошедшие олимпиады
      </Link>
      <MontagePlayer
        key={event.id + event.video}
        src={event.video}
        poster={event.image}
        title={event.title}
      />
      <header className="recap-heading">
        <div>
          <span className="eyebrow">Это было незабываемо.</span>
          <h1>{event.title}</h1>
          <div className="recap-meta">
            <span>
              <MapPin size={17} />
              {event.city}, {event.country}
            </span>
            <span>
              <CalendarDays size={17} />
              {dateLabel(event.date)}
            </span>
          </div>
        </div>
        <a className="recap-results-link" href="#results">
          <Trophy size={20} />
          <span>К результатам</span>
          <ArrowUpRight size={20} />
        </a>
      </header>
      <section className="recap-story">
        <div>
          <span className="eyebrow">Об олимпиаде</span>
          <h2>
            Знания, встречи
            <br />
            <span>и открытия.</span>
          </h2>
          <p>{event.description}</p>
          <div className="subject-tags">
            {event.subjects.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
        <div className="recap-program">
          <span className="eyebrow">В программе</span>
          <ul>
            {event.includes.map((item) => (
              <li key={item}>
                <Check size={18} />
                {item}
              </li>
            ))}
          </ul>
          {event.price !== null && (
            <div className="recap-price">
              <span>Стоимость участия</span>
              <strong>{priceLabel(event)}</strong>
            </div>
          )}
        </div>
      </section>
      <section
        id="results"
        className="recap-results"
        aria-labelledby="results-title"
      >
        <div className="recap-results-heading">
          <div>
            <span className="eyebrow">Каждое достижение важно</span>
            <h2 id="results-title">
              Результаты <span>олимпиады.</span>
            </h2>
          </div>
          <Trophy size={43} strokeWidth={1.2} />
        </div>
        {!data.resultsPublished ? (
          <div className="recap-results-empty">
            <h3>Результаты готовятся</h3>
            <p>Организатор опубликует итоговый протокол на этой странице.</p>
          </div>
        ) : !results.length ? (
          <div className="recap-results-empty">
            <h3>Итоги обновляются</h3>
            <p>Результаты участников появятся здесь после внесения баллов.</p>
          </div>
        ) : (
          <>
            <p className="recap-results-note">
              Места рассчитываются отдельно для каждого класса и дисциплины. При
              равных баллах место совпадает.
            </p>
            <div className="recap-result-filters">
              <label className="archive-search">
                <Search size={18} />
                <input
                  type="search"
                  aria-label="Найти участника"
                  placeholder="Имя или фамилия участника"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="archive-filter">
                <span>Дисциплина</span>
                <select
                  aria-label="Дисциплина результатов"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Все дисциплины</option>
                  {[...new Set(results.map((r) => r.subject))].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="archive-filter">
                <span>Класс</span>
                <select
                  aria-label="Класс результатов"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">Все классы</option>
                  {[...new Set(results.map((r) => r.grade))]
                    .sort((a, b) => a - b)
                    .map((g) => (
                      <option value={g} key={g}>
                        {gradeLabel(g)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="recap-table-wrap">
              <table className="recap-results-table">
                <thead>
                  <tr>
                    <th scope="col">Место</th>
                    <th scope="col">Участник</th>
                    <th scope="col">Дисциплина</th>
                    <th scope="col">Класс</th>
                    <th scope="col">Баллы</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={`${r.subject}:${r.grade}:${i}`}>
                      <td data-label="Место">
                        <span
                          className={
                            "recap-place" +
                            (r.place <= 3 ? ` podium-${r.place}` : "")
                          }
                        >
                          {r.place === 1 && <Trophy size={14} />}
                          {r.place}
                        </span>
                      </td>
                      <td data-label="Участник">
                        <strong>{r.name}</strong>
                      </td>
                      <td data-label="Дисциплина">{r.subject}</td>
                      <td data-label="Класс">{gradeLabel(r.grade)}</td>
                      <td data-label="Баллы">
                        <strong>{scoreFormat.format(r.score)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <div className="recap-results-empty">
                <h3>Участник не найден</h3>
                <p>Проверьте имя или выберите другие фильтры.</p>
                <button
                  className="text-link"
                  onClick={() => {
                    setSubject("");
                    setGrade("");
                    setQuery("");
                  }}
                >
                  Сбросить фильтры <ArrowUpRight size={17} />
                </button>
              </div>
            )}
            <p className="recap-shown" aria-live="polite">
              Показано результатов: {visible.length} из {results.length}
            </p>
          </>
        )}
      </section>
      <div className="recap-next">
        <div>
          <span className="eyebrow">Впереди — новые открытия.</span>
          <p>Увидимся на следующей олимпиаде?</p>
        </div>
        <Link className="btn btn-primary" to="/#events">
          Выбрать олимпиаду <ArrowUpRight size={19} />
        </Link>
      </div>
    </main>
  );
}
