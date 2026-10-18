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
  Compass,
} from "lucide-react";
import { api, dateLabel, priceLabel, Modal, Spinner, ErrorBox } from "../main";

const subjects = [
  { name: "Все направления", icon: Globe2 },
  { name: "Математика", icon: Sigma },
  { name: "Английский язык", icon: Languages },
  { name: "Ментальная арифметика", icon: Calculator },
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
    "Сайт покажет номер вашей заявки — сохраните его. Организатор получит список команды и свяжется с вами по указанным контактам, чтобы подтвердить участие и обсудить детали.",
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
              <span className="hero-line">Знания —</span>
              <span className="hero-line">ваш билет</span>
              <span className="hero-line">
                в <em>большой мир.</em>
              </span>
            </h1>
            <p className="hero-description">
              Математика, английский и ментальная арифметика.
              <br className="desktop-break" /> Олимпиады в разных странах, новые
              друзья
              <br className="desktop-break" /> и впечатления, которые остаются.
            </p>
            <div className="hero-buttons">
              <a className="btn btn-primary" href="#events">
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
          <div className="hero-visual">
            <div className="destination-photo" key={destination?.id || "baku"}>
              <img
                src={destination?.image || "/images/baku.png"}
                alt={
                  destination
                    ? `Иллюстрация города ${destination.city}`
                    : "Иллюстрация Баку"
                }
                fetchPriority="high"
              />
              <div className="photo-gradient" />
            </div>
            <span className="destination-kicker">
              <span /> Учимся. Путешествуем. Растём.
            </span>
            <div className="destination-caption">
              <span className="destination-country">
                {destination?.country || "Азербайджан"}
              </span>
              <div
                className="destination-city-row"
                aria-live="polite"
                aria-atomic="true"
              >
                <h2 key={destination?.id}>
                  {destination?.city || "Баку"}
                  <ArrowUpRight size={41} aria-hidden="true" />
                </h2>
                <span className="destination-date">
                  {destination
                    ? dateLabel(destination.date).replace(" г.", "")
                    : "Откройте новые страны"}
                </span>
              </div>
            </div>
            <div className="destination-controls">
              <span className="destination-counter">
                {String((slide % Math.max(events.length, 1)) + 1).padStart(
                  2,
                  "0",
                )}{" "}
                <span>
                  / {String(Math.max(events.length, 1)).padStart(2, "0")}
                </span>
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
              <a href="#events" className="destination-link">
                Смотреть афишу <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </div>
        <div
          className="container hero-subjects"
          aria-label="Направления олимпиад"
        >
          <span>
            Три способа
            <br />
            показать, на что ты способен
          </span>
          <div>
            <Sigma size={24} />
            <strong>Математика</strong>
          </div>
          <div>
            <Languages size={23} />
            <strong>Английский язык</strong>
          </div>
          <div>
            <Calculator size={23} />
            <strong>Ментальная арифметика</strong>
          </div>
        </div>
      </section>

      <section className="section events-section container" id="events">
        <div className="section-title-row" data-reveal>
          <div>
            <span className="eyebrow">Ближайшие олимпиады</span>
            <h2>
              Следующая точка
              <br />
              на <span className="accent-text">вашей карте.</span>
            </h2>
          </div>
          <p className="section-aside">
            Выберите город и направление.
            <br />
            Зарегистрируйте команду —<br />
            остальное обсудим вместе.
          </p>
        </div>
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
          <div className="event-grid">
            {visible.map((e) => (
              <article className="event-card" key={e.id} data-reveal>
                <button
                  className="event-image-button"
                  onClick={() => setSelected(e)}
                  aria-label={"Подробнее об олимпиаде в городе " + e.city}
                >
                  <img
                    src={e.image}
                    alt={`Иллюстрация города ${e.city}`}
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
                    <Link
                      className="btn btn-primary"
                      to={"/events/" + e.id + "/register"}
                    >
                      {isOpen(e) ? "Зарегистрировать команду" : "Подробнее"}
                      <ArrowUpRight size={20} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Compass size={36} />
            <h3>Новые направления впереди</h3>
            <p>Попробуйте выбрать другую дисциплину или страну.</p>
            <button
              className="text-link"
              onClick={() => {
                setFilter("Все направления");
                setCountry("Все страны");
              }}
            >
              Показать все олимпиады <ArrowRight size={18} />
            </button>
          </div>
        )}
        <p className="demo-note">
          Предварительная афиша. Даты, программу и стоимость подтвердит
          организатор.
        </p>
      </section>

      <section className="about-section" id="about">
        <div className="container">
          <div className="about-grid" data-reveal>
            <div>
              <span className="eyebrow">Зачем мы это делаем</span>
              <h2>
                Мир больше
                <br />
                школьного
                <br />
                <span>учебника.</span>
              </h2>
            </div>
            <div className="about-copy">
              <div className="about-symbol" aria-hidden="true">
                <Globe2 size={60} strokeWidth={1} />
                <ArrowUpRight size={35} />
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
              },
              {
                n: "02",
                t: "Увидеть больше",
                p: "Новые города, культура и университеты — чтобы мечты стали конкретнее.",
              },
              {
                n: "03",
                t: "Найти своих",
                p: "Встретить детей, которым тоже интересно думать, учиться и открывать.",
              },
            ].map((v) => (
              <div key={v.n} data-reveal>
                <span className="value-number">{v.n}</span>
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
            <span className="eyebrow">Учителям — проще</span>
            <h2>
              Вдохновлять — ваша часть.
              <br />
              <span className="accent-text">Упростить — наша.</span>
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
              t: "Оставьте контакты",
              p: "Укажите центр, учителя и педагогов для благодарственных сертификатов.",
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
        <section className="cta-section container" data-reveal>
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
          <ArrowUpRight
            className="cta-arrow"
            aria-hidden="true"
            strokeWidth={1.1}
          />
        </section>
      )}

      <section className="section container faq-section" id="faq">
        <div data-reveal>
          <span className="eyebrow">Перед первым шагом</span>
          <h2>
            Хороший
            <br /> <span className="accent-text">вопрос.</span>
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

      {selected && (
        <Modal
          title={selected.city + " · " + selected.country}
          onClose={() => setSelected(null)}
        >
          <img
            className="detail-image"
            src={selected.image}
            alt={selected.city}
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
            to={"/events/" + selected.id + "/register"}
          >
            {isOpen(selected) ? "Зарегистрировать команду" : "Подробнее"}
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
