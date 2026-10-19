import { tr, getLanguage } from "../i18n/runtime.js";
import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  MapPin,
} from "lucide-react";
import { api, dateLabel, priceLabel, ErrorBox, Spinner } from "../main";
import MontagePlayer from "../components/MontagePlayer";
import "./Archive.css";

export default function EventRecap() {
  const { id } = useParams();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
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
    if (data)
      document.title = data.event.title + " · " + tr("Итоги") + " · IQ LAND";
    return () => {
      document.title = previous;
    };
  }, [data, getLanguage()]);
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
          <ArrowLeft size={16} />
          {tr(" Все прошедшие олимпиады")}
        </Link>
        <ErrorBox>{tr(error || "Олимпиада не найдена")}</ErrorBox>
        <button
          className="btn btn-secondary"
          onClick={() => setReload((v) => v + 1)}
        >
          {tr("Повторить загрузку")}
        </button>
      </main>
    );
  const event = data.event;
  return (
    <main className="container recap-page">
      <Link className="back-link" to="/archive">
        <ArrowLeft size={16} />
        {tr(" Все прошедшие олимпиады")}
      </Link>
      <MontagePlayer
        key={event.id + event.video}
        src={event.video}
        poster={event.image}
        title={tr(event.title)}
      />
      <header className="recap-heading">
        <div>
          <span className="eyebrow">{tr("Это было незабываемо.")}</span>
          <h1>{tr(event.title)}</h1>
          <div className="recap-meta">
            <span>
              <MapPin size={17} />
              {tr(event.city)}, {tr(event.country)}
            </span>
            <span>
              <CalendarDays size={17} />
              {tr(dateLabel(event.date))}
            </span>
          </div>
        </div>
      </header>
      <section className="recap-story">
        <div>
          <span className="eyebrow">{tr("Об олимпиаде")}</span>
          <h2>
            {tr("Знания, встречи")}
            <br />
            <span>{tr("и открытия.")}</span>
          </h2>
          <p>{tr(event.description)}</p>
          <div className="subject-tags">
            {event.subjects.map((s) => (
              <span key={s}>{tr(s)}</span>
            ))}
          </div>
        </div>
        <div className="recap-program">
          <span className="eyebrow">{tr("В программе")}</span>
          <ul>
            {event.includes.map((item) => (
              <li key={item}>
                <Check size={18} />
                {tr(item)}
              </li>
            ))}
          </ul>
          {event.price !== null && (
            <div className="recap-price">
              <span>{tr("Стоимость участия")}</span>
              <strong>{tr(priceLabel(event))}</strong>
            </div>
          )}
        </div>
      </section>
      <div className="recap-next">
        <div>
          <span className="eyebrow">{tr("Впереди — новые открытия.")}</span>
          <p>{tr("Увидимся на следующей олимпиаде?")}</p>
        </div>
        <Link className="btn btn-primary" to="/#events">
          {tr("Выбрать олимпиаду ")}
          <ArrowUpRight size={19} />
        </Link>
      </div>
    </main>
  );
}
