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
    if (data) document.title = data.event.title + " · Итоги · IQ LAND";
    return () => {
      document.title = previous;
    };
  }, [data]);
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
