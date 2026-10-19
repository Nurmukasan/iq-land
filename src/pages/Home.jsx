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
  Sparkles,
  MoveUpRight,
  Send,
  Users,
  BadgeCheck,
  Asterisk,
} from "lucide-react";
import { api, dateLabel, priceLabel, Modal, Spinner, ErrorBox } from "../main";
import EventPhoto from "../components/EventPhoto";
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
              <span className="live-dot" /> Международные детские олимпиады
            </p>
            <h1>
              <span className="hero-line">Думай шире.</span>
              <span className="hero-line">Открывай</span>
              <span className="hero-line">
                <em>целый мир.</em>
              </span>
            </h1>
            <p className="hero-description">
              Математика, английский и ментальная арифметика.
              <br className="desktop-break" /> Олимпиады в разных странах, новые
              друзья
              <br className="desktop-break" /> и впечатления, которые остаются.
            </p>
            <div className="hero-buttons">
              <a className="btn btn-primary" href="#events" data-magnetic>
                Выбрать олимпиаду{" "}
                <span className="button-arrow">
                  <ArrowUpRight size={21} />
                </span>
              </a>
              <a className="text-link" href="#teachers">
                Как участвовать <ArrowDownIcon />
              </a>
            </div>
            <div className="hero-footnote">
              <span className="footnote-line" />
              <p>
                Для учителей и образовательных центров.
                <br />
                <strong>Вся команда — в одной заявке.</strong>
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
                  alt={`Олимпиада IQ LAND · ${destination.city}`}
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
                    Весь
                    <br />
                    <em>мир.</em>
                  </strong>
                  <span className="world-poster-note">
                    начинается
                    <br />с любопытства.
                  </span>
                </div>
              )}
              <div className="world-stage-label">
                <span>IQ LAND</span>
                <span>
                  Олимпиады без границ <ArrowUpRight size={16} />
                </span>
              </div>
              <div
                className="world-stage-caption"
                key={destination?.id || "world"}
              >
                <span className="destination-country">
                  {destination?.country || "Знания. Путешествия. Открытия."}
                </span>
                <div
                  className="destination-city-row"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <h2>{destination?.city || "Возможности — повсюду."}</h2>
                  {destination && (
                    <span className="destination-date">
                      {dateLabel(destination.date).replace(" г.", "")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="destination-controls">
              {destination ? (
                <>
                  <span className="destination-counter">
                    {String((slide % events.length) + 1).padStart(2, "0")}{" "}
                    <span>/ {String(events.length).padStart(2, "0")}</span>
                  </span>
                  <div className="destination-nav">
                    <button
                      aria-label="Предыдущая олимпиада"
                      disabled={events.length < 2}
                      onClick={() =>
                        setSlide((s) => (s - 1 + events.length) % events.length)
                      }
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <button
                      aria-label="Следующая олимпиада"
                      disabled={events.length < 2}
                      onClick={() => setSlide((s) => (s + 1) % events.length)}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <span className="world-stage-motto">
                  За пределами привычного <ArrowRight size={17} />
                </span>
              )}
              <a href="#events" className="destination-link">
                Смотреть афишу <ArrowUpRight size={18} />
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
              <span className="section-dot" /> Три способа показать, на что ты
              способен
            </span>
            <h2 id="directions-title">
              У каждого таланта
              <br />
              своё <span className="word-highlight">направление.</span>
            </h2>
          </div>
          <p>
            Разные интересы.
            <br />
            Одинаково большие возможности.
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
              aria-label={"Найти олимпиады: " + direction.name}
            >
              <div className="direction-card-top">
                <span>{direction.number} / НАПРАВЛЕНИЕ</span>
                <span className="direction-arrow">
                  <ArrowUpRight size={22} />
                </span>
              </div>
              <div className="direction-art" aria-hidden="true">
                <span className="direction-orbit" />
                <strong>{direction.glyph}</strong>
                <span className="direction-spark">
                  <Asterisk strokeWidth={1.5} />
                </span>
              </div>
              <div className="direction-card-copy">
                <span className="direction-kicker">{direction.label}</span>
                <h3>{direction.name}</h3>
                <p>{direction.description}</p>
              </div>
              <span className="direction-card-link">
                Выбрать олимпиаду <ArrowRight size={18} />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="section events-section container" id="events">
        <div className="section-title-row" data-reveal>
          <div>
            <span className="eyebrow">
              <span className="section-dot" /> Ближайшие олимпиады
            </span>
            <h2>
              Следующая точка
              <br />
              на{" "}
              <span className="word-highlight highlight-blue">
                вашей карте.
              </span>
            </h2>
          </div>
          <p className="section-aside">
            {events.length ? (
              <>
                Выберите город и направление.
                <br />
                Зарегистрируйте команду —<br />
                остальное обсудим вместе.
              </>
            ) : (
              <>
                Города, даты и программы
                <br />
                появятся здесь, когда откроется
                <br />
                регистрация на новые события.
              </>
            )}
          </p>
        </div>
        {events.length > 0 && (
          <div className="event-filters">
            <div className="filter-tabs" aria-label="Направление олимпиады">
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
                  {s.name}
                </button>
              ))}
            </div>
            <label className="country-select">
              <MapPin size={18} />
              <select
                aria-label="Страна олимпиады"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option>Все страны</option>
                {[...new Set(events.map((e) => e.country))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <Spinner />
        ) : error ? (
          <div>
            <ErrorBox>{error}</ErrorBox>
            <button className="btn btn-secondary" onClick={load}>
              Повторить загрузку
            </button>
          </div>
        ) : visible.length ? (
          <div className="event-grid" key={filter + country}>
            {visible.map((e) => (
              <article className="event-card" key={e.id} data-reveal data-tilt>
                <button
                  className="event-image-button"
                  onClick={() => setSelected(e)}
                  aria-label={"Подробнее об олимпиаде в городе " + e.city}
                >
                  <EventPhoto
                    src={e.image}
                    alt={`Олимпиада IQ LAND · ${e.city}`}
                    loading="lazy"
                  />
                  <span className="event-date">
                    <CalendarDays size={17} />
                    {dateLabel(e.date).replace(" г.", "")}
                  </span>
                  <span className="event-photo-arrow">
                    <ArrowUpRight size={24} />
                  </span>
                </button>
                <div className="event-card-body">
                  <div className="event-city-row">
                    <div>
                      <span className="event-country">{e.country}</span>
                      <h3>{e.city}</h3>
                    </div>
                    <button
                      className="text-link event-program-link"
                      onClick={() => setSelected(e)}
                    >
                      Программа <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="subject-tags">
                    {e.subjects.map((s) => (
                      <span key={s}>{s}</span>
                    ))}
                  </div>
                  <div className="event-inclusion">
                    <span>Ещё в программе</span>
                    <p>
                      {e.includes
                        .filter(
                          (x) =>
                            !x.includes("Участие") && !x.includes("Сертификат"),
                        )
                        .join(" · ") || "Подробности в программе олимпиады"}
                    </p>
                  </div>
                  <div className="event-card-bottom">
                    <div>
                      <strong>{priceLabel(e)}</strong>
                      <span className="available">
                        <span />
                        {isOpen(e)
                          ? "Приём заявок открыт"
                          : "Регистрация завершена"}
                      </span>
                    </div>
                    {isOpen(e) ? (
                      <Link
                        className="btn btn-primary"
                        to={"/events/" + e.id + "/register"}
                      >
                        Зарегистрировать команду
                        <ArrowUpRight size={20} />
                      </Link>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelected(e)}
                      >
                        Смотреть программу <ArrowUpRight size={20} />
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
                {events.length
                  ? "Новые направления впереди"
                  : "Впереди — новые открытия."}
              </h3>
              <p>
                {events.length
                  ? "Попробуйте выбрать другую дисциплину или страну."
                  : "Здесь появятся города, даты и программы ближайших олимпиад. А пока узнайте, как зарегистрировать свою команду."}
              </p>
              {events.length ? (
                <button
                  className="text-link"
                  onClick={() => {
                    setFilter("Все направления");
                    setCountry("Все страны");
                  }}
                >
                  Показать все олимпиады <ArrowRight size={18} />
                </button>
              ) : (
                <a
                  className="text-link"
                  href="https://www.instagram.com/iqland_competitions/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Следить за анонсами <Instagram size={18} />
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
                <span className="section-dot" /> Это больше, чем олимпиада
              </span>
              <h2>
                Мир больше
                <br />
                <span>учебника.</span>
              </h2>
            </div>
            <div className="about-copy">
              <div className="discovery-orbit" aria-hidden="true">
                <Globe2 size={102} strokeWidth={1} />
                <span className="orbit-dot orbit-coral" />
                <span className="orbit-dot orbit-lime" />
                <span className="orbit-label">
                  ЗНАНИЯ БЕЗ ГРАНИЦ <ArrowUpRight size={15} />
                </span>
              </div>
              <p className="about-statement">
                Олимпиада — повод поверить в себя.
                <br />
                Путешествие — увидеть, сколько
                <br />
                всего ещё впереди.
              </p>
              <p>
                IQ LAND соединяет знания с настоящими впечатлениями. Дети
                пробуют свои силы, знакомятся с новыми странами и возвращаются с
                желанием расти дальше.
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
                  <span className="value-number">{v.n}</span>
                  <v.icon size={25} strokeWidth={1.6} />
                </div>
                <h3>{v.t}</h3>
                <p>{v.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section container teachers-section" id="teachers">
        <div className="section-title-row" data-reveal>
          <div>
            <span className="eyebrow">
              <span className="section-dot" /> Учителям — проще
            </span>
            <h2>
              Большая команда.
              <br />
              <span className="word-highlight highlight-violet">
                Одна простая заявка.
              </span>
            </h2>
          </div>
          <p className="section-aside">
            Не нужны аккаунты учеников
            <br />и десятки отдельных заявок.
            <br />
            Вся команда — в одной форме.
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
                {s.n}
                <ArrowUpRight size={24} />
              </span>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
        <div className="teacher-shortcuts" data-reveal>
          <span>
            <Users size={18} /> Вся команда сразу
          </span>
          <span>
            <BadgeCheck size={18} /> Педагоги в одной заявке
          </span>
          <span>
            <Send size={18} /> Telegram после регистрации
          </span>
        </div>
        <div className="teacher-bottom">
          <span>
            <Check size={20} /> Вы отправляете заявку. Организатор подтверждает
            детали.
          </span>
          <a className="btn btn-primary" href="#events">
            Начать с выбора олимпиады <ArrowUpRight size={20} />
          </a>
        </div>
      </section>

      {promo?.active && (
        <section className="cta-section container next-chapter" data-reveal>
          <div>
            <span className="eyebrow">{promo.eyebrow}</span>
            <h2>
              {promo.title}
              <br />
              <span>{promo.subtitle}</span>
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
              {promo.button}
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
          <span className="eyebrow">Перед первым шагом</span>
          <h2>
            Сначала — вопросы.
            <br />{" "}
            <span className="word-highlight highlight-coral">
              Потом — открытия.
            </span>
          </h2>
          <p>
            Ответы, чтобы начать
            <br />
            без лишних сомнений.
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
                <span>{q}</span>
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
                  <p>{a}</p>
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
            <span className="section-dot" /> На связи — IQ LAND
          </span>
          <h2 id="contacts-title">
            Знакомство
            <br />
            начинается с <span>hello.</span>
          </h2>
          <p>
            Есть вопрос об участии или хотите привезти свою команду? Напишите
            нам в Instagram. Там же — анонсы и моменты с наших олимпиад.
          </p>
          <a className="contact-event-link" href="#events">
            А пока — выберите свою олимпиаду <ArrowUpRight size={19} />
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
            <span>НАШ INSTAGRAM</span>
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
            Новости, впечатления и ответы <ArrowRight size={19} />
          </span>
        </a>
      </section>

      {selected && (
        <Modal
          title={selected.city + " · " + selected.country}
          onClose={() => setSelected(null)}
        >
          <EventPhoto
            className="detail-image"
            src={selected.image}
            alt={`Олимпиада IQ LAND · ${selected.city}`}
          />
          <span className="eyebrow">{dateLabel(selected.date)}</span>
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          <div className="subject-tags">
            {selected.subjects.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <h4>В программе</h4>
          <ul className="check-list">
            {selected.includes.map((s) => (
              <li key={s}>
                <Check size={18} />
                {s}
              </li>
            ))}
          </ul>
          <p>
            Регистрация до {dateLabel(selected.deadline)}.<br />
            <strong>{priceLabel(selected)}</strong>
          </p>
          <p className="muted small">
            Предварительная программа. Организатор подтвердит детали после
            заявки.
          </p>
          <Link
            className="btn btn-primary full-width"
            to={
              isOpen(selected)
                ? "/events/" + selected.id + "/register"
                : "/register"
            }
          >
            {isOpen(selected)
              ? "Зарегистрировать команду"
              : "Выбрать другую олимпиаду"}
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
