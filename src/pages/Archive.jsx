import { tr, getLanguage } from "../i18n/runtime.js";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
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
    document.title = tr("Прошедшие олимпиады · IQ LAND");
    return () => {
      document.title = previous;
    };
  }, [getLanguage()]);
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
        <ArrowLeft size={16} />
        {tr(" К будущим олимпиадам")}
      </Link>
      <header className="archive-intro">
        <div>
          <span className="eyebrow">{tr("История IQ LAND")}</span>
          <h1>
            {tr("Прошедшие")}
            <br />
            <span>{tr("олимпиады.")}</span>
          </h1>
        </div>
        <p>
          {tr("Каждая олимпиада — своя история.")}
          <br />
          {tr("Здесь — её лучшие моменты")}
          <br />
          {tr("и программы соревнований.")}
        </p>
      </header>
      {events.length > 0 && (
        <div className="archive-filters">
          <label className="archive-search">
            <Search size={18} />
            <input
              type="search"
              aria-label={tr("Найти прошедшую олимпиаду")}
              placeholder={tr("Название или город")}
              value={query}
              onChange={(e) => update("q", e.target.value)}
            />
          </label>
          <label className="archive-filter">
            <span>{tr("Страна")}</span>
            <select
              aria-label={tr("Страна прошедшей олимпиады")}
              value={country}
              onChange={(e) => update("country", e.target.value)}
            >
              <option value="">{tr("Все страны")}</option>
              {[...new Set(events.map((e) => e.country))]
                .sort((a, b) => a.localeCompare(b, "ru"))
                .map((c) => (
                  <option key={c} value={c}>
                    {tr(c)}
                  </option>
                ))}
            </select>
          </label>
          <label className="archive-filter">
            <span>{tr("Год")}</span>
            <select
              aria-label={tr("Год олимпиады")}
              value={year}
              onChange={(e) => update("year", e.target.value)}
            >
              <option value="">{tr("Все годы")}</option>
              {[...new Set(events.map((e) => e.date.slice(0, 4)))]
                .sort()
                .reverse()
                .map((y) => (
                  <option key={y} value={y}>
                    {tr(y)}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="archive-error">
          <ErrorBox>{tr(error)}</ErrorBox>
          <button
            className="btn btn-secondary"
            onClick={() => setReload((v) => v + 1)}
          >
            {tr("Повторить загрузку")}
          </button>
        </div>
      ) : visible.length ? (
        <>
          <div className="archive-count">
            <span>{tr("Соревнования, которые нас объединили.")}</span>
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
                aria-label={tr("Итоги олимпиады: {0} · {1} · {2}", [
                  event.title,
                  event.city,
                  dateLabel(event.date),
                ])}
              >
                <div className="archive-card-photo">
                  <EventPhoto
                    src={event.image}
                    alt={tr("Олимпиада IQ LAND · {0}", [event.city])}
                    loading="lazy"
                  />
                  {event.video && (
                    <span className="archive-film-tag">
                      <Play size={13} fill="currentColor" />
                      {tr(" Видео олимпиады")}
                    </span>
                  )}
                  <span className="archive-card-arrow">
                    <ArrowUpRight size={25} />
                  </span>
                </div>
                <div className="archive-card-body">
                  <div className="archive-card-meta">
                    <span>
                      {tr(event.flag)} {tr(event.country)}
                    </span>
                    <span>
                      <CalendarDays size={15} />
                      {tr(dateLabel(event.date).replace(" г.", ""))}
                    </span>
                  </div>
                  <h2>{tr(event.city)}</h2>
                  <p className="archive-card-title">{tr(event.title)}</p>
                  <div className="subject-tags">
                    {event.subjects.map((s) => (
                      <span key={s}>{tr(s)}</span>
                    ))}
                  </div>
                  <div className="archive-card-bottom">
                    <span className="archive-results-soon">
                      {tr(
                        event.video
                          ? "Монтаж олимпиады"
                          : "Программа и впечатления",
                      )}
                    </span>
                    <strong>
                      {tr("Смотреть итоги ")}
                      <ArrowUpRight size={18} />
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
            {tr(
              events.length
                ? "Такой олимпиады пока нет"
                : "История только начинается.",
            )}
          </h2>
          <p>
            {tr(
              events.length
                ? "Попробуйте другой город, страну или год."
                : "Здесь появятся прошедшие соревнования, видео и программы. А следующую олимпиаду можно выбрать уже сейчас.",
            )}
          </p>
          {events.length ? (
            <button className="text-link" onClick={() => setParams({})}>
              {tr("Сбросить фильтры ")}
              <ArrowUpRight size={17} />
            </button>
          ) : (
            <Link className="btn btn-primary" to="/#events">
              {tr("К будущим олимпиадам ")}
              <ArrowUpRight size={18} />
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
