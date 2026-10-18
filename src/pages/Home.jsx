import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  MapPin,
  CalendarDays,
  Check,
  Plus,
  Minus,
  Globe2,
  Sparkles,
  GraduationCap,
  Trophy,
  Calculator,
  Languages,
  Sigma,
  MoveUpRight,
  ArrowDown,
  Compass,
  ClipboardList,
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
    "Кто может зарегистрировать учеников?",
    "Заявку подаёт учитель или представитель образовательного центра. Создавать отдельный аккаунт для каждого ученика не нужно: вся команда регистрируется в одной форме.",
  ],
  [
    "Можно ли вставить список учеников из Excel?",
    "Да. Скопируйте строки из таблицы и нажмите «Вставить список» в форме регистрации. Формат: ФИО, дата рождения, класс. Каждая строка станет отдельным участником. Дисциплины можно выбрать для каждого ученика.",
  ],
  [
    "Что входит в стоимость участия?",
    "Программа указана в карточке каждой олимпиады. Стоимость и условия поездки уточняются организатором до подтверждения заявки. Перелёт и проживание не считаются включёнными, если это прямо не указано в программе.",
  ],
  [
    "Как получить благодарственный сертификат учителю?",
    "При регистрации укажите ФИО дополнительных педагогов в разделе «Благодарственные сертификаты». Эти имена попадут в список организатора для подготовки документов.",
  ],
  [
    "Что произойдёт после отправки заявки?",
    "Вы получите номер заявки прямо на сайте. Организатор увидит команду в общем списке и свяжется по указанным контактам для подтверждения участия и уточнения деталей.",
  ],
];
export default function Home() {
  const [events, setEvents] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("Все направления"),
    [country, setCountry] = useState("Все страны"),
    [selected, setSelected] = useState(null),
    [faq, setFaq] = useState(0),
    [promo, setPromo] = useState(null);
  useEffect(() => {
    api("/promo")
      .then(setPromo)
      .catch(() => {});
  }, []);
  const load = () => {
    setLoading(true);
    setError("");
    api("/events")
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const visible = events.filter(
    (e) =>
      (filter === "Все направления" || e.subjects.includes(filter)) &&
      (country === "Все страны" || e.country === country),
  );
  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="live-dot" /> МЕЖДУНАРОДНЫЕ ОЛИМПИАДЫ · СЕЗОН 2027
            </div>
            <h1>
              Знания, которые
              <br />
              открывают{" "}
              <span className="world-word">
                мир.
                <svg viewBox="0 0 250 20" aria-hidden="true">
                  <path d="M3 15 Q115 -3 245 9" />
                </svg>
              </span>
            </h1>
            <p className="hero-description">
              Большие открытия начинаются с маленького шага.
              <br className="desktop-break" /> Олимпиады, путешествия и новые
              возможности
              <br className="desktop-break" /> для ваших учеников — вместе с IQ
              LAND.
            </p>
            <div className="hero-buttons">
              <a className="btn btn-primary" href="#events">
                Выбрать олимпиаду <ArrowUpRight size={20} />
              </a>
              <a className="text-link" href="#teachers">
                Я учитель <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-footnote">
              <span className="mini-icon">
                <GraduationCap size={21} />
              </span>
              <p>
                <strong>Одна заявка — вся команда</strong>
                <br />
                Больше времени для того, что важно
              </p>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-photo"
              src="/images/baku.png"
              alt="Архитектурная иллюстрация Баку: Старый город и Пламенные башни"
            />
            <div className="hero-photo-shade" />
            <div className="hero-photo-caption">
              <span className="location-label">
                <MapPin size={14} /> Баку, Азербайджан
              </span>
              <span>
                Следующая остановка —<br />
                <strong>новые вершины.</strong>
              </span>
              <a
                href="#events"
                className="circle-btn"
                aria-label="Посмотреть олимпиады"
              >
                <ArrowUpRight />
              </a>
            </div>
            <div className="hero-sticker">
              <Sparkles size={25} />
              <span>
                Здесь растут
                <br />
                <strong>большие мечты</strong>
              </span>
            </div>
            <div className="orbit-stamp">
              <Globe2 size={34} />
              <span>LEARN. TRAVEL. GROW.</span>
            </div>
            <div className="visual-index">
              <span>01</span> / 02 <div />
            </div>
          </div>
        </div>
      </section>
      <section className="values-strip">
        <div className="container">
          <span>
            <Trophy /> Знания за пределами класса
          </span>
          <i>✳</i>
          <span>
            <Globe2 /> Путешествия со смыслом
          </span>
          <i>✳</i>
          <span>
            <GraduationCap /> Вдохновение для будущего
          </span>
          <i>✳</i>
        </div>
      </section>
      <section className="section events-section container" id="events">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">
              <span /> КАЛЕНДАРЬ ВОЗМОЖНОСТЕЙ
            </span>
            <h2>
              Куда отправимся <span className="serif-text">за знаниями?</span>
            </h2>
          </div>
          <p className="section-aside">
            Выберите направление.
            <br />
            Соберите команду. Откройте больше.
          </p>
        </div>
        <div className="event-filters">
          <div className="filter-tabs">
            {subjects.map((s) => (
              <button
                key={s.name}
                className={
                  filter === s.name ? "filter-tab active" : "filter-tab"
                }
                onClick={() => setFilter(s.name)}
              >
                <s.icon size={16} />
                {s.name}
              </button>
            ))}
          </div>
          <label className="country-select">
            <MapPin size={16} />
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
              Повторить
            </button>
          </div>
        ) : visible.length ? (
          <div className="event-grid">
            {visible.map((e, i) => (
              <article className="event-card" key={e.id}>
                <button
                  className="event-image-button"
                  onClick={() => setSelected(e)}
                  aria-label={"Подробнее об олимпиаде в городе " + e.city}
                >
                  <img
                    src={e.image}
                    alt={
                      e.city === "Баку"
                        ? "Панорама Баку"
                        : "Алматы у подножия Тянь-Шаня"
                    }
                    loading="lazy"
                  />
                  <span className="event-date">
                    <CalendarDays size={14} />
                    {dateLabel(e.date).replace(" г.", "")}
                  </span>
                  <span className="image-country">
                    {e.flag} {e.country}
                  </span>
                  <span className="event-photo-arrow">
                    <ArrowUpRight size={21} />
                  </span>
                </button>
                <div className="event-card-body">
                  <div className="event-city-row">
                    <h3>
                      {e.city}
                      <span>, {e.country}</span>
                    </h3>
                    <span className="available">
                      <span />{" "}
                      {e.deadline >= new Date().toISOString().slice(0, 10)
                        ? "Регистрация открыта"
                        : "Регистрация завершена"}
                    </span>
                  </div>
                  <div className="subject-tags">
                    {e.subjects.map((s) => (
                      <span key={s}>
                        {s === "Математика" ? (
                          <Sigma size={13} />
                        ) : s === "Английский язык" ? (
                          <Languages size={13} />
                        ) : (
                          <Calculator size={13} />
                        )}{" "}
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="event-inclusion">
                    <Sparkles size={16} />
                    <span>
                      {e.includes
                        .filter(
                          (x) =>
                            !x.includes("Участие") && !x.includes("Сертификат"),
                        )
                        .join(" · ")}
                    </span>
                  </div>
                  <div className="event-card-bottom">
                    <div>
                      <small>Участие в олимпиаде</small>
                      <strong>{priceLabel(e)}</strong>
                    </div>
                    <Link
                      className="btn btn-primary btn-small"
                      to={"/events/" + e.id + "/register"}
                    >
                      {e.deadline >= new Date().toISOString().slice(0, 10)
                        ? "Зарегистрировать команду"
                        : "Подробнее"}{" "}
                      <ArrowUpRight size={17} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Compass size={32} />
            <h3>Новые направления уже на подходе</h3>
            <p>Попробуйте выбрать другую дисциплину или страну.</p>
            <button
              className="text-link"
              onClick={() => {
                setFilter("Все направления");
                setCountry("Все страны");
              }}
            >
              Показать все олимпиады <ArrowRight size={16} />
            </button>
          </div>
        )}
        <p className="demo-note">
          Предварительная афиша: даты, программа и стоимость требуют
          подтверждения организатором.
        </p>
      </section>
      <section className="about-section" id="about">
        <div className="container about-grid">
          <div className="about-art">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-globe">
              <Globe2 size={130} strokeWidth={0.6} />
            </div>
            <span className="art-chip chip-one">
              <Sigma /> Думаем
            </span>
            <span className="art-chip chip-two">
              <Compass /> Открываем
            </span>
            <span className="art-chip chip-three">
              <Trophy /> Растём
            </span>
            <span className="art-star star-one">✳</span>
            <span className="art-star star-two">✧</span>
            <div className="art-bottom">БОЛЬШЕ, ЧЕМ ОЛИМПИАДА</div>
          </div>
          <div className="about-copy">
            <span className="eyebrow">
              <span /> МИР БОЛЬШЕ УЧЕБНИКА
            </span>
            <h2>
              Не просто соревнование.
              <br />
              <span className="serif-text">Опыт, который остаётся.</span>
            </h2>
            <p>
              Мы верим, что знания обретают смысл, когда выходят за пределы
              класса. IQ LAND объединяет интеллектуальные олимпиады и знакомство
              с новыми странами.
            </p>
            <div className="about-points">
              <div>
                <span>01</span>
                <div>
                  <h4>Раскрыть свой потенциал</h4>
                  <p>Попробовать силы и увидеть, на что способен.</p>
                </div>
              </div>
              <div>
                <span>02</span>
                <div>
                  <h4>Открыть новые горизонты</h4>
                  <p>Познакомиться с культурой, городами и университетами.</p>
                </div>
              </div>
              <div>
                <span>03</span>
                <div>
                  <h4>Найти единомышленников</h4>
                  <p>Встретить тех, кто так же любит учиться и мечтать.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section container teachers-section" id="teachers">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">
              <span /> УЧИТЕЛЯМ — С ЗАБОТОЙ
            </span>
            <h2>
              Ваша команда.
              <br />
              <span className="serif-text">Одна простая заявка.</span>
            </h2>
          </div>
          <p className="section-aside">
            Меньше рутины, больше вдохновения.
            <br />
            Мы продумали регистрацию за вас.
          </p>
        </div>
        <div className="steps-grid">
          {[
            {
              n: "01",
              icon: Compass,
              t: "Выберите олимпиаду",
              p: "Найдите подходящий город, дату и направление для вашей команды.",
            },
            {
              n: "02",
              icon: ClipboardList,
              t: "Добавьте учеников",
              p: "Введите данные в удобную таблицу или вставьте готовый список из Excel.",
            },
            {
              n: "03",
              icon: GraduationCap,
              t: "Расскажите о центре",
              p: "Укажите свои контакты и педагогов, которым нужен благодарственный сертификат.",
            },
          ].map((s) => (
            <div className="step-card" key={s.n}>
              <div className="step-top">
                <s.icon size={26} strokeWidth={1.5} />
                <span>{s.n}</span>
              </div>
              <h3>{s.t}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
        <div className="teacher-bottom">
          <span>
            <Check size={17} /> Без отдельных аккаунтов для учеников
          </span>
          <a className="text-link" href="#events">
            Собрать свою команду <ArrowUpRight size={19} />
          </a>
        </div>
      </section>
      {promo?.active && (
        <section className="cta-section container">
          <div>
            <span className="eyebrow">{promo.eyebrow}</span>
            <h2>
              {promo.title}
              <br />
              <span>{promo.subtitle}</span>
            </h2>
            <a
              href={promo.href}
              className="btn btn-yellow"
              rel={
                promo.href.startsWith("https:")
                  ? "noopener noreferrer"
                  : undefined
              }
            >
              {promo.button} <ArrowUpRight size={20} />
            </a>
          </div>
          <div className="cta-graphic" aria-hidden="true">
            <div />
            <Globe2 size={160} strokeWidth={0.7} />
            <span>✳</span>
            <ArrowUpRight size={50} />
          </div>
        </section>
      )}
      <section className="section container faq-section" id="faq">
        <div>
          <span className="eyebrow">
            <span /> ВСЁ ПРОСТО
          </span>
          <h2>
            Остались <span className="serif-text">вопросы?</span>
          </h2>
          <p>
            Собрали то, что важно знать
            <br />
            перед первым шагом.
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
                {q}
                {faq === i ? <Minus size={19} /> : <Plus size={19} />}
              </button>
              {faq === i && <p id={"faq-" + i}>{a}</p>}
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
                <Check size={17} />
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
            Зарегистрировать команду <ArrowUpRight size={18} />
          </Link>
        </Modal>
      )}
    </main>
  );
}
