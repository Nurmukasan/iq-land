import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Globe2,
  Play,
  Search,
} from "lucide-react";
import { api, dateLabel, ErrorBox, Spinner } from "../main";
import EventPhoto from "../components/EventPhoto";
import "./Archive.css";

export default function Archive() {
  const [events, setEvents] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "",
    year = params.get("year") || "",
    country = params.get("country") || "";
  useEffect(() => {
    const previous = document.title;
    document.title = "Прошедшие олимпиады · IQ LAND";
    return () => {
      document.title = previous;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/archive", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setEvents(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const visible = useMemo(
    () =>
      events.filter(
        (event) =>
          (!year || event.date.startsWith(year)) &&
          (!country || event.country === country) &&
          (!query.trim() ||
            [event.title, event.city, event.country].some((v) =>
              v
                .toLocaleLowerCase("ru-RU")
                .includes(query.trim().toLocaleLowerCase("ru-RU")),
            )),
      ),
    [events, year, country, query],
  );
  const update = (key, value) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return (
    <main className="container archive-page">
      <Link className="back-link" to="/#events">
        <ArrowLeft size={16} /> К будущим олимпиадам
      </Link>
      <header className="archive-intro">
        <div>
          <span className="eyebrow">История IQ LAND</span>
          <h1>
            Прошедшие
            <br />
            <span>олимпиады.</span>
          </h1>
        </div>
        <p>
          Каждая олимпиада — своя история.
          <br />
          Здесь её лучшие моменты, программа
          <br />и результаты участников.
        </p>
      </header>
      {events.length > 0 && (
        <div className="archive-filters">
          <label className="archive-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="Найти прошедшую олимпиаду"
              placeholder="Название или город"
              value={query}
              onChange={(e) => update("q", e.target.value)}
            />
          </label>
          <label className="archive-filter">
            <span>Страна</span>
            <select
              aria-label="Страна прошедшей олимпиады"
              value={country}
              onChange={(e) => update("country", e.target.value)}
            >
              <option value="">Все страны</option>
              {[...new Set(events.map((e) => e.country))]
                .sort((a, b) => a.localeCompare(b, "ru"))
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
          <label className="archive-filter">
            <span>Год</span>
            <select
              aria-label="Год олимпиады"
              value={year}
              onChange={(e) => update("year", e.target.value)}
            >
              <option value="">Все годы</option>
              {[...new Set(events.map((e) => e.date.slice(0, 4)))]
                .sort()
                .reverse()
                .map((y) => (
                  <option key={y}>{y}</option>
                ))}
            </select>
          </label>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="archive-error">
          <ErrorBox>{error}</ErrorBox>
          <button
            className="btn btn-secondary"
            onClick={() => setReload((v) => v + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      ) : visible.length ? (
        <>
          <div className="archive-count">
            <span>Соревнования, которые нас объединили.</span>
            <span>
              {visible.length} / {events.length}
            </span>
          </div>
          <div className="archive-grid">
            {visible.map((event) => (
              <Link
                className="archive-card"
                to={"/archive/" + event.id}
                key={event.id}
                data-tilt
                aria-label={`Итоги олимпиады: ${event.title} · ${event.city} · ${dateLabel(event.date)}`}
              >
                <div className="archive-card-photo">
                  <EventPhoto
                    src={event.image}
                    alt={`Олимпиада IQ LAND · ${event.city}`}
                    loading="lazy"
                  />
                  {event.video && (
                    <span className="archive-film-tag">
                      <Play size={13} fill="currentColor" /> Видео олимпиады
                    </span>
                  )}
                  <span className="archive-card-arrow">
                    <ArrowUpRight size={25} />
                  </span>
                </div>
                <div className="archive-card-body">
                  <div className="archive-card-meta">
                    <span>
                      {event.flag} {event.country}
                    </span>
                    <span>
                      <CalendarDays size={15} />
                      {dateLabel(event.date).replace(" г.", "")}
                    </span>
                  </div>
                  <h2>{event.city}</h2>
                  <p className="archive-card-title">{event.title}</p>
                  <div className="subject-tags">
                    {event.subjects.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                  <div className="archive-card-bottom">
                    <span
                      className={
                        event.resultsPublished
                          ? "archive-results-ready"
                          : "archive-results-soon"
                      }
                    >
                      {event.resultsPublished && <Check size={15} />}
                      {event.resultsPublished
                        ? "Результаты опубликованы"
                        : "Итоги готовятся"}
                    </span>
                    <strong>
                      Смотреть итоги <ArrowUpRight size={18} />
                    </strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="archive-empty">
          <Globe2 size={42} strokeWidth={1.2} />
          <h2>
            {events.length
              ? "Такой олимпиады пока нет"
              : "История только начинается."}
          </h2>
          <p>
            {events.length
              ? "Попробуйте другой город, страну или год."
              : "Здесь появятся прошедшие соревнования, видео и результаты. А следующую олимпиаду можно выбрать уже сейчас."}
          </p>
          {events.length ? (
            <button className="text-link" onClick={() => setParams({})}>
              Сбросить фильтры <ArrowUpRight size={17} />
            </button>
          ) : (
            <Link className="btn btn-primary" to="/#events">
              К будущим олимпиадам <ArrowUpRight size={18} />
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
