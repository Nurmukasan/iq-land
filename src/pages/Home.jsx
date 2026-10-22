import { tr } from "../i18n/runtime.js";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  MapPin,
  CalendarDays,
  Check,
  Plus,
  Minus,
  Globe2,
  Calculator,
  Languages,
  Sigma,
  Instagram,
  Phone,
  Sparkles,
  MoveUpRight,
  Send,
  Users,
  BadgeCheck,
  Asterisk,
} from "lucide-react";
import { api, dateLabel, priceLabel, Modal, Spinner, ErrorBox } from "../main";
import EventPhoto from "../components/EventPhoto";
import { academicContacts, generalContact, technicalContact } from "../lib/contacts.js";
import "./Home.css";
import "./LandingSections.css";

const subjects = [
  { name: "Все направления", icon: Globe2 },
  { name: "Математика", icon: Sigma },
  { name: "Английский язык", icon: Languages },
  { name: "Ментальная арифметика", icon: Calculator },
];
const directions = [
  {
    name: "Математика",
    theme: "coral",
    label: "Думать. Находить. Решать.",
    description: "Логика, смелые идеи и удовольствие от найденного решения.",
    glyph: "x²",
    number: "01",
  },
  {
    name: "Английский язык",
    theme: "violet",
    label: "Say hello to the world.",
    description:
      "Язык, который помогает знакомиться, путешествовать и понимать мир.",
    glyph: "Hello!",
    number: "02",
  },
  {
    name: "Ментальная арифметика",
    theme: "lime",
    label: "Скорость начинается с мысли.",
    description:
      "Концентрация, быстрый счёт и уверенность в собственных силах.",
    glyph: "1 2 3",
    number: "03",
  },
];
const faqs = [
  [
    "Кто регистрирует учеников?",
    "Заявку подаёт учитель или представитель образовательного центра. Ученик не создаёт аккаунт: всю команду можно зарегистрировать в одной форме.",
  ],
  [
    "Можно вставить готовый список из Excel?",
    "Да. Скопируйте три столбца: ФИО, дата рождения и класс. В форме нажмите «Вставить список» — каждая строка станет отдельным учеником. Дисциплины можно выбрать для каждого участника.",
  ],
  [
    "Что включено в участие?",
    "Программа указана в карточке олимпиады. Стоимость и детали организатор подтвердит перед участием. Перелёт и проживание включены только тогда, когда это прямо указано в программе.",
  ],
  [
    "Учителя получат благодарственные сертификаты?",
    "В форме можно добавить педагогов, которым нужен сертификат. Ответственный учитель уже включён. Имена попадут организатору для подготовки документов.",
  ],
  [
    "Что будет после отправки заявки?",
    "Сохраните номер заявки. Если у олимпиады есть Telegram-канал, ссылка появится сразу после отправки — присоединяйтесь, чтобы получать новости мероприятия. Организатор получит список команды и свяжется с вами для подтверждения участия.",
  ],
];
const isOpen = (event) =>
  event.deadline >= new Date().toISOString().slice(0, 10);

function useReveal(dependencies) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (
      !root ||
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.08 },
    );
    const items = root.querySelectorAll("[data-reveal]:not(.is-visible)");
    for (const item of items) {
      item.classList.add("will-reveal");
      observer.observe(item);
    }
    return () => observer.disconnect();
  }, dependencies);
  return ref;
}

export default function Home() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Все направления");
  const [country, setCountry] = useState("Все страны");
  const [selected, setSelected] = useState(null);
  const [faq, setFaq] = useState(-1);
  const [promo, setPromo] = useState(null);
  const [slide, setSlide] = useState(0);
  const root = useReveal([loading, filter, country, promo]);
  const load = () => {
    setLoading(true);
    setError("");
    api("/events")
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    api("/promo")
      .then(setPromo)
      .catch(() => {});
  }, []);
  const visible = events.filter(
    (e) =>
      (filter === "Все направления" || e.subjects.includes(filter)) &&
      (country === "Все страны" || e.country === country),
  );
  const destination = events.length ? events[slide % events.length] : null;

  return (
    <main className="home-page" ref={root}>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="live-dot" />
              {tr(" Международные детские олимпиады")}
            </p>
            <h1>
              <span className="hero-line">{tr("Думай шире.")}</span>
              <span className="hero-line">{tr("Открывай")}</span>
              <span className="hero-line">
                <em>{tr("целый мир.")}</em>
              </span>
            </h1>
            <p className="hero-description">
              {tr("Математика, английский и ментальная арифметика.")}
              <br className="desktop-break" />
              {tr(" Олимпиады в разных странах, новые друзья")}
              <br className="desktop-break" />
              {tr(" и впечатления, которые остаются.")}
            </p>
            <div className="hero-buttons">
              <a className="btn btn-primary" href="#events" data-magnetic>
                {tr("Выбрать олимпиаду")}{" "}
                <span className="button-arrow">
                  <ArrowUpRight size={21} />
                </span>
              </a>
              <a className="text-link" href="#teachers">
                {tr("Как участвовать ")}
                <ArrowDownIcon />
              </a>
            </div>
            <div className="hero-footnote">
              <span className="footnote-line" />
              <p>
                {tr("Для учителей и образовательных центров.")}
                <br />
                <strong>{tr("Вся команда — в одной заявке.")}</strong>
              </p>
            </div>
          </div>
          <div className="hero-visual world-stage" data-tilt>
            <div
              className={
                "world-stage-surface" + (destination?.image ? " has-photo" : "")
              }
            >
              {destination?.image ? (
                <EventPhoto
                  key={destination.id + destination.image}
                  src={destination.image}
                  alt={tr("Олимпиада IQ LAND · {0}", [destination.city])}
                  className="world-stage-photo"
                  fetchPriority="high"
                />
              ) : (
                <div className="world-poster" aria-hidden="true">
                  <div className="world-poster-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                  <svg
                    className="world-asterisk"
                    viewBox="0 0 200 200"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M100 20v160M20 100h160M43 43l114 114M43 157 157 43"
                      stroke="currentColor"
                      strokeWidth="18"
                      strokeLinecap="round"
                    />
                  </svg>
                  <strong>
                    {tr("Весь")}
                    <br />
                    <em>{tr("мир.")}</em>
                  </strong>
                  <span className="world-poster-note">
                    {tr("начинается с любопытства.")}
                  </span>
                </div>
              )}
              <div className="world-stage-label">
                <span>IQ LAND</span>
                <span>
                  {tr("Олимпиады без границ ")}
                  <ArrowUpRight size={16} />
                </span>
              </div>
              <div
                className="world-stage-caption"
                key={destination?.id || "world"}
              >
                <span className="destination-country">
                  {tr(destination?.country || "Знания. Путешествия. Открытия.")}
                </span>
                <div
                  className="destination-city-row"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <h2>{tr(destination?.city || "Возможности — повсюду.")}</h2>
                  {destination && (
                    <span className="destination-date">
                      {tr(dateLabel(destination.date).replace(" г.", ""))}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="destination-controls">
              {destination ? (
                <>
                  <span className="destination-counter">
                    {tr(String((slide % events.length) + 1).padStart(2, "0"))}{" "}
                    <span>/ {tr(String(events.length).padStart(2, "0"))}</span>
                  </span>
                  <div className="destination-nav">
                    <button
                      aria-label={tr("Предыдущая олимпиада")}
                      disabled={events.length < 2}
                      onClick={() =>
                        setSlide((s) => (s - 1 + events.length) % events.length)
                      }
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <button
                      aria-label={tr("Следующая олимпиада")}
                      disabled={events.length < 2}
                      onClick={() => setSlide((s) => (s + 1) % events.length)}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <span className="world-stage-motto">
                  {tr("За пределами привычного ")}
                  <ArrowRight size={17} />
                </span>
              )}
              <a href="#events" className="destination-link">
                {tr("Смотреть афишу ")}
                <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section
        className="directions-section container"
        aria-labelledby="directions-title"
      >
        <div className="landing-section-heading" data-reveal>
          <div>
            <span className="eyebrow">
              <span className="section-dot" />
              {tr(" Три способа показать, на что ты способен")}
            </span>
            <h2 id="directions-title">
              {tr("У каждого таланта")}
              <br />
              {tr("своё ")}
              <span className="word-highlight">{tr("направление.")}</span>
            </h2>
          </div>
          <p>
            {tr("Разные интересы.")}
            <br />
            {tr("Одинаково большие возможности.")}
          </p>
        </div>
        <div className="direction-grid">
          {directions.map((direction) => (
            <a
              key={direction.name}
              className={"direction-card direction-" + direction.theme}
              href="#events"
              data-reveal
              data-tilt
              onClick={() => {
                setFilter(direction.name);
                setCountry("Все страны");
              }}
              aria-label={tr("Найти олимпиады: " + direction.name)}
            >
              <div className="direction-card-top">
                <span>
                  {tr(direction.number)}
                  {tr(" / НАПРАВЛЕНИЕ")}
                </span>
                <span className="direction-arrow">
                  <ArrowUpRight size={22} />
                </span>
              </div>
              <div className="direction-art" aria-hidden="true">
                <span className="direction-orbit" />
                <strong>{tr(direction.glyph)}</strong>
                <span className="direction-spark">
                  <Asterisk strokeWidth={1.5} />
                </span>
              </div>
              <div className="direction-card-copy">
                <span className="direction-kicker">{tr(direction.label)}</span>
                <h3>{tr(direction.name)}</h3>
                <p>{tr(direction.description)}</p>
              </div>
              <span className="direction-card-link">
                {tr("Выбрать олимпиаду ")}
                <ArrowRight size={18} />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="section events-section container" id="events">
        <div className="section-title-row" data-reveal>
          <div>
            <span className="eyebrow">
              <span className="section-dot" />
              {tr(" Ближайшие олимпиады")}
            </span>
            <h2>
              {tr("Следующая точка")}
              <br />
              {tr("на")}{" "}
              <span className="word-highlight highlight-blue">
                {tr("вашей карте.")}
              </span>
            </h2>
          </div>
          <p className="section-aside">
            {events.length ? (
              <>
                {tr("Выберите город и направление.")}
                <br />
                {tr("Зарегистрируйте команду —")}
                <br />
                {tr("остальное обсудим вместе.")}
              </>
            ) : (
              <>
                {tr("Города, даты и программы")}
                <br />
                {tr("появятся здесь, когда откроется")}
                <br />
                {tr("регистрация на новые события.")}
              </>
            )}
          </p>
        </div>
        {events.length > 0 && (
          <div className="event-filters">
            <div
              className="filter-tabs"
              aria-label={tr("Направление олимпиады")}
            >
              {subjects.map((s) => (
                <button
                  key={s.name}
                  className={
                    filter === s.name ? "filter-tab active" : "filter-tab"
                  }
                  aria-pressed={filter === s.name}
                  onClick={() => setFilter(s.name)}
                >
                  <s.icon size={18} />
                  {tr(s.name)}
                </button>
              ))}
            </div>
            <label className="country-select">
              <MapPin size={18} />
              <select
                aria-label={tr("Страна олимпиады")}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="Все страны">{tr("Все страны")}</option>
                {[...new Set(events.map((e) => e.country))].map((c) => (
                  <option key={c} value={c}>
                    {tr(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <Spinner />
        ) : error ? (
          <div>
            <ErrorBox>{tr(error)}</ErrorBox>
            <button className="btn btn-secondary" onClick={load}>
              {tr("Повторить загрузку")}
            </button>
          </div>
        ) : visible.length ? (
          <div className="event-grid" key={filter + country}>
            {visible.map((e) => (
              <article className="event-card" key={e.id} data-reveal data-tilt>
                <button
                  className="event-image-button"
                  onClick={() => setSelected(e)}
                  aria-label={tr("Подробнее об олимпиаде в городе " + e.city)}
                >
                  <EventPhoto
                    src={e.image}
                    alt={tr("Олимпиада IQ LAND · {0}", [e.city])}
                    loading="lazy"
                  />
                  <span className="event-date">
                    <CalendarDays size={17} />
                    {tr(dateLabel(e.date).replace(" г.", ""))}
                  </span>
                  <span className="event-photo-arrow">
                    <ArrowUpRight size={24} />
                  </span>
                </button>
                <div className="event-card-body">
                  <div className="event-city-row">
                    <div>
                      <span className="event-country">{tr(e.country)}</span>
                      <h3>{tr(e.city)}</h3>
                    </div>
                    <button
                      className="text-link event-program-link"
                      onClick={() => setSelected(e)}
                    >
                      {tr("Программа ")}
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="subject-tags">
                    {e.subjects.map((s) => (
                      <span key={s}>{tr(s)}</span>
                    ))}
                  </div>
                  <div className="event-inclusion">
                    <span>{tr("Ещё в программе")}</span>
                    <p>
                      {tr(
                        e.includes
                          .filter(
                            (x) =>
                              !x.includes("Участие") &&
                              !x.includes("Сертификат"),
                          )
                          .join(" · ") || "Подробности в программе олимпиады",
                      )}
                    </p>
                  </div>
                  <div className="event-card-bottom">
                    <div>
                      <strong>{tr(priceLabel(e))}</strong>
                      <span className="available">
                        <span />
                        {tr(
                          isOpen(e)
                            ? "Приём заявок открыт"
                            : "Регистрация завершена",
                        )}
                      </span>
                    </div>
                    {isOpen(e) ? (
                      <Link
                        className="btn btn-primary"
                        to={"/events/" + e.id + "/register"}
                      >
                        {tr("Зарегистрировать команду")}
                        <ArrowUpRight size={20} />
                      </Link>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelected(e)}
                      >
                        {tr("Смотреть программу ")}
                        <ArrowUpRight size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state empty-journey" data-reveal>
            <span className="empty-journey-index" aria-hidden="true">
              NEXT <ArrowUpRight size={30} />
            </span>
            <div>
              <h3>
                {tr(
                  events.length
                    ? "Новые направления впереди"
                    : "Впереди — новые открытия.",
                )}
              </h3>
              <p>
                {tr(
                  events.length
                    ? "Попробуйте выбрать другую дисциплину или страну."
                    : "Здесь появятся города, даты и программы ближайших олимпиад. А пока узнайте, как зарегистрировать свою команду.",
                )}
              </p>
              {events.length ? (
                <button
                  className="text-link"
                  onClick={() => {
                    setFilter("Все направления");
                    setCountry("Все страны");
                  }}
                >
                  {tr("Показать все олимпиады ")}
                  <ArrowRight size={18} />
                </button>
              ) : (
                <a
                  className="text-link"
                  href="https://www.instagram.com/iqland_competitions/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tr("Следить за анонсами ")}
                  <Instagram size={18} />
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="about-section discovery-section" id="about">
        <div className="container">
          <div className="about-grid" data-reveal>
            <div>
              <span className="eyebrow">
                <span className="section-dot" />
                {tr(" Это больше, чем олимпиада")}
              </span>
              <h2>
                {tr("Мир больше")}
                <br />
                <span>{tr("учебника.")}</span>
              </h2>
            </div>
            <div className="about-copy">
              <div className="discovery-orbit" aria-hidden="true">
                <Globe2 size={102} strokeWidth={1} />
                <span className="orbit-dot orbit-coral" />
                <span className="orbit-dot orbit-lime" />
                <span className="orbit-label">
                  {tr("ЗНАНИЯ БЕЗ ГРАНИЦ ")}
                  <ArrowUpRight size={15} />
                </span>
              </div>
              <p className="about-statement">
                {tr("Олимпиада — повод поверить в себя.")}
                <br />
                {tr("Путешествие — увидеть, сколько")}
                <br />
                {tr("всего ещё впереди.")}
              </p>
              <p>
                {tr(
                  "IQ LAND соединяет знания с настоящими впечатлениями. Дети пробуют свои силы, знакомятся с новыми странами и возвращаются с желанием расти дальше.",
                )}
              </p>
            </div>
          </div>
          <div className="about-values">
            {[
              {
                n: "01",
                t: "Поверить в себя",
                p: "Решить непростую задачу. Сделать шаг вперёд. Почувствовать: «Я могу».",
                icon: Sparkles,
              },
              {
                n: "02",
                t: "Увидеть больше",
                p: "Новые города, культура и университеты — чтобы мечты стали конкретнее.",
                icon: Globe2,
              },
              {
                n: "03",
                t: "Найти своих",
                p: "Встретить детей, которым тоже интересно думать, учиться и открывать.",
                icon: Users,
              },
            ].map((v) => (
              <div key={v.n} data-reveal className="discovery-value">
                <div className="value-top">
                  <span className="value-number">{tr(v.n)}</span>
                  <v.icon size={25} strokeWidth={1.6} />
                </div>
                <h3>{tr(v.t)}</h3>
                <p>{tr(v.p)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section container teachers-section" id="teachers">
        <div className="section-title-row" data-reveal>
          <div>
            <span className="eyebrow">
              <span className="section-dot" />
              {tr(" Учителям — проще")}
            </span>
            <h2>
              {tr("Большая команда.")}
              <br />
              <span className="word-highlight highlight-violet">
                {tr("Одна простая заявка.")}
              </span>
            </h2>
          </div>
          <p className="section-aside">
            {tr("Не нужны аккаунты учеников")}
            <br />
            {tr("и десятки отдельных заявок.")}
            <br />
            {tr("Вся команда — в одной форме.")}
          </p>
        </div>
        <div className="steps-grid">
          {[
            {
              n: "01",
              t: "Выберите олимпиаду",
              p: "Город, дата и дисциплины — всё важное уже в карточке.",
            },
            {
              n: "02",
              t: "Соберите команду",
              p: "Добавляйте учеников строками или вставьте готовый список из Excel.",
            },
            {
              n: "03",
              t: "Будьте на связи",
              p: "Укажите контакты и отправьте заявку. Ссылку на канал мероприятия покажем, если организатор её добавил.",
            },
          ].map((s) => (
            <div className="step-card" key={s.n} data-reveal>
              <span className="step-number">
                {tr(s.n)}
                <ArrowUpRight size={24} />
              </span>
              <h3>{tr(s.t)}</h3>
              <p>{tr(s.p)}</p>
            </div>
          ))}
        </div>
        <div className="teacher-shortcuts" data-reveal>
          <span>
            <Users size={18} />
            {tr(" Вся команда сразу")}
          </span>
          <span>
            <BadgeCheck size={18} />
            {tr(" Педагоги в одной заявке")}
          </span>
          <span>
            <Send size={18} />
            {tr(" Telegram после регистрации")}
          </span>
        </div>
        <div className="teacher-bottom">
          <span>
            <Check size={20} />
            {tr(" Вы отправляете заявку. Организатор подтверждает детали.")}
          </span>
          <a className="btn btn-primary" href="#events">
            {tr("Начать с выбора олимпиады ")}
            <ArrowUpRight size={20} />
          </a>
        </div>
      </section>

      {promo?.active && (
        <section className="cta-section container next-chapter" data-reveal>
          <div>
            <span className="eyebrow">{tr(promo.eyebrow)}</span>
            <h2>
              {tr(promo.title)}
              <br />
              <span>{tr(promo.subtitle)}</span>
            </h2>
            <a
              href={promo.href}
              className="btn btn-primary"
              rel={
                promo.href.startsWith("https:")
                  ? "noopener noreferrer"
                  : undefined
              }
            >
              {tr(promo.button)}
              <ArrowUpRight size={21} />
            </a>
          </div>
          <div className="cta-decoration" aria-hidden="true">
            <span>
              LET’S
              <br />
              GO.
            </span>
            <MoveUpRight size={90} strokeWidth={1} />
          </div>
        </section>
      )}

      <section className="section container faq-section" id="faq">
        <div data-reveal>
          <span className="eyebrow">{tr("Перед первым шагом")}</span>
          <h2>
            {tr("Сначала — вопросы.")}
            <br />{" "}
            <span className="word-highlight highlight-coral">
              {tr("Потом — открытия.")}
            </span>
          </h2>
          <p>
            {tr("Ответы, чтобы начать")}
            <br />
            {tr("без лишних сомнений.")}
          </p>
        </div>
        <div className="faq-list">
          {faqs.map(([q, a], i) => (
            <div
              className={"faq-item " + (faq === i ? "expanded" : "")}
              key={q}
            >
              <button
                aria-expanded={faq === i}
                aria-controls={"faq-" + i}
                onClick={() => setFaq(faq === i ? -1 : i)}
              >
                <span>{tr(q)}</span>
                <span className="faq-toggle">
                  {faq === i ? <Minus size={21} /> : <Plus size={21} />}
                </span>
              </button>
              <div
                id={"faq-" + i}
                className="faq-answer"
                inert={faq !== i ? true : undefined}
              >
                <div>
                  <p>{tr(a)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="contact-section container"
        id="contacts"
        aria-labelledby="contacts-title"
        data-reveal
      >
        <div className="contact-copy">
          <span className="eyebrow">
            <span className="section-dot" />
            {tr(" На связи — IQ LAND")}
          </span>
          <h2 id="contacts-title">
            {tr("Знакомство начинается с hello.")
              .split("hello")
              .map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span>hello</span>}
                  {part}
                </React.Fragment>
              ))}
          </h2>
          <p>
            {tr(
              "Есть вопрос об участии или хотите привезти свою команду? Позвоните нам. Анонсы и моменты с наших олимпиад — в Instagram.",
            )}
          </p>
          <a className="contact-phone" href={generalContact.href}>
            <Phone size={22} aria-hidden="true" />
            <span>
              <span className="contact-phone-label">{tr("Общие вопросы")}</span>
              <strong>{generalContact.phone}</strong>
            </span>
          </a>
          <a className="contact-event-link" href="#events">
            {tr("А пока — выберите свою олимпиаду ")}
            <ArrowUpRight size={19} />
          </a>
        </div>
        <a
          className="instagram-contact"
          href="https://www.instagram.com/iqland_competitions/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram IQ LAND: @iqland_competitions"
          data-tilt
        >
          <div className="instagram-contact-top">
            <span>{tr("НАШ INSTAGRAM")}</span>
            <ArrowUpRight size={25} />
          </div>
          <div className="instagram-art" aria-hidden="true">
            <Instagram size={104} strokeWidth={1.2} />
            <span>
              <Asterisk strokeWidth={1.5} />
            </span>
          </div>
          <strong>@iqland_competitions</strong>
          <span className="instagram-contact-bottom">
            {tr("Новости, впечатления и ответы ")}
            <ArrowRight size={19} />
          </span>
        </a>
        <div className="academic-contacts" aria-labelledby="academic-contacts-title">
          <h3 id="academic-contacts-title">{tr("Вопросы по учебной части")}</h3>
          <div className="academic-contact-grid">
            {academicContacts.map((contact) => (
              <a className="academic-contact" href={contact.href} key={contact.href}>
                <div>
                  <span className="academic-contact-subject">{tr(contact.subject)}</span>
                  <h4>{contact.name}</h4>
                  <span className="academic-contact-phone">{contact.phone}</span>
                </div>
                <Phone size={21} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
        <div className="technical-contact" id="technical-support" aria-labelledby="technical-support-title">
          <h3 id="technical-support-title">{tr("Автор сайта и техническая поддержка")}</h3>
          <div className="technical-contact-links">
            <a href={technicalContact.href}>
              <Phone size={18} aria-hidden="true" />
              {technicalContact.phone}
            </a>
            <a href={technicalContact.telegramUrl} target="_blank" rel="noopener noreferrer">
              <Send size={18} aria-hidden="true" />
              Telegram · {technicalContact.telegramHandle}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {selected && (
        <Modal
          title={tr(selected.city + " · " + selected.country)}
          onClose={() => setSelected(null)}
        >
          <EventPhoto
            className="detail-image"
            src={selected.image}
            alt={tr("Олимпиада IQ LAND · {0}", [selected.city])}
          />
          <span className="eyebrow">{tr(dateLabel(selected.date))}</span>
          <h3>{tr(selected.title)}</h3>
          <p>{tr(selected.description)}</p>
          <div className="subject-tags">
            {selected.subjects.map((s) => (
              <span key={s}>{tr(s)}</span>
            ))}
          </div>
          <h4>{tr("В программе")}</h4>
          <ul className="check-list">
            {selected.includes.map((s) => (
              <li key={s}>
                <Check size={18} />
                {tr(s)}
              </li>
            ))}
          </ul>
          <p>
            {tr("Регистрация до ")}
            {tr(dateLabel(selected.deadline))}.<br />
            <strong>{tr(priceLabel(selected))}</strong>
          </p>
          <p className="muted small">
            {tr(
              "Предварительная программа. Организатор подтвердит детали после заявки.",
            )}
          </p>
          <Link
            className="btn btn-primary full-width"
            to={
              isOpen(selected)
                ? "/events/" + selected.id + "/register"
                : "/register"
            }
          >
            {tr(
              isOpen(selected)
                ? "Зарегистрировать команду"
                : "Выбрать другую олимпиаду",
            )}
            <ArrowUpRight size={20} />
          </Link>
        </Modal>
      )}
    </main>
  );
}
function ArrowDownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 4v16m-6-6 6 6 6-6" />
    </svg>
  );
}
