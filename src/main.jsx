import { formatDate } from "../shared/i18n/dates.js";
import { tr, getIntlLocale, getLanguage } from "./i18n/runtime.js";
import LanguageProvider, { useLanguage } from "./i18n/LanguageProvider";
import LanguageSwitcher from "./components/LanguageSwitcher";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  LogIn,
  Check,
  AlertCircle,
  LoaderCircle,
  Instagram,
} from "lucide-react";
import "@fontsource-variable/golos-text";
import "@fontsource-variable/unbounded";
import "./styles.css";
import Home from "./pages/Home";
import Registration from "./pages/Registration";
import Dashboard, { Login } from "./pages/Dashboard";
import AwardsPage from "./pages/AwardsPage";
import InteractionMotion from "./components/InteractionMotion";
import Archive from "./pages/Archive";
import EventRecap from "./pages/EventRecap";

export async function api(url, options = {}) {
  let res;
  try {
    res = await fetch("/api" + url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": getIntlLocale(),
        ...options.headers,
      },
      credentials: "same-origin",
    });
  } catch {
    throw new Error(
      "Не удалось связаться с сервером. Проверьте подключение и повторите.",
    );
  }
  const data = await res
    .json()
    .catch(() => ({ error: "Сервер временно недоступен" }));
  if (!res.ok) {
    const error = new Error(data.error || "Не удалось выполнить запрос");
    error.status = res.status;
    error.fields = data.fields || [];
    throw error;
  }
  return data;
}
export const dateLabel = (value) => formatDate(value, getLanguage());
export const priceLabel = (e) =>
  e.price === null
    ? tr("Стоимость уточняется")
    : new Intl.NumberFormat(getIntlLocale(), {
        style: "currency",
        currency: e.currency,
        maximumFractionDigits: 0,
      }).format(e.price);
const AppContext = createContext();
export const useApp = () => useContext(AppContext);
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      {tr(" Загрузка…")}
    </div>
  );
}
export function ErrorBox({ children }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{tr(children)}</span>
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = ref.current?.querySelectorAll(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        className={"modal " + (wide ? "modal-wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={tr(title)}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{tr(title)}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label={tr("Закрыть")}
          >
            <X />
          </button>
        </div>
        {tr(children)}
      </section>
    </div>
  );
}
function Header() {
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const { user } = useApp();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc]);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="skip-link" href="#main-content">
          {tr("К содержимому")}
        </a>
        <Link to="/" aria-label={tr("IQ LAND — главная")} className="brand">
          <img src="/images/logo.svg" alt="IQ LAND" />
        </Link>
        <nav
          id="primary-navigation"
          className={open ? "nav-links is-open" : "nav-links"}
          aria-label={tr("Главная навигация")}
        >
          <Link to="/#events">{tr("Олимпиады")}</Link>
          <Link
            to="/archive"
            aria-current={
              loc.pathname.startsWith("/archive") ? "page" : undefined
            }
          >
            {tr("Прошедшие олимпиады")}
          </Link>
          <Link to="/register">{tr("Регистрация")}</Link>
          <Link to="/#teachers">{tr("Учителям")}</Link>
          <Link to="/#contacts">{tr("Контакты")}</Link>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher />
          <Link className="header-cta" to="/#events">
            {tr("Выбрать олимпиаду ")}
            <ArrowUpRight size={18} />
          </Link>
          <Link
            className="btn-nav"
            aria-label={tr("Личный кабинет")}
            to={user ? "/cabinet" : "/login"}
          >
            <LogIn size={19} />
            <span>{tr("Кабинет")}</span>
          </Link>
          <button
            ref={menuButton}
            className="icon-btn mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label={tr("Открыть меню")}
            aria-expanded={open}
            aria-controls="primary-navigation"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-main">
          <Link className="brand" to="/">
            <img src="/images/logo.svg" alt="IQ LAND" />
          </Link>
          <p>
            {tr("Объединяем знания.")}
            <br />
            {tr("Открываем мир.")}
          </p>
          <div>
            <Link to="/#events">{tr("Олимпиады")}</Link>
            <Link to="/archive">{tr("Прошедшие олимпиады")}</Link>
            <Link to="/#teachers">{tr("Для учителей")}</Link>
          </div>
          <div>
            <Link to="/#faq">{tr("Вопросы и ответы")}</Link>
            <Link to="/#contacts">{tr("Контакты")}</Link>
            <a
              className="footer-instagram"
              href="https://www.instagram.com/iqland_competitions/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Instagram size={17} /> @iqland_competitions
            </a>
            <Link to="/login">
              {tr("Кабинет организатора ")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {tr(new Date().getFullYear())}
            {tr(" IQ LAND. Все права защищены.")}
          </span>
          <Link to="/privacy">{tr("Политика конфиденциальности")}</Link>
          <span>{tr("С заботой о больших мечтах")}</span>
        </div>
      </div>
    </footer>
  );
}
function Privacy() {
  return (
    <main className="container prose-page">
      <Link className="back-link" to="/">
        {tr("← На главную")}
      </Link>
      <span className="eyebrow">IQ LAND</span>
      <h1>{tr("Обработка персональных данных")}</h1>
      <h2>{tr("Организатор и связь")}</h2>
      <p>
        {tr(
          "Олимпиады проводит команда IQ LAND, Казахстан. По вопросам регистрации и обработки данных напишите в Instagram:",
        )}{" "}
        <a
          href="https://www.instagram.com/iqland_competitions/"
          target="_blank"
          rel="noopener noreferrer"
        >
          @iqland_competitions
        </a>
        .
      </p>
      <p>
        {tr(
          "Форма регистрации предназначена для совершеннолетних учителей и представителей образовательных центров. Ученик самостоятельно заявку не подаёт.",
        )}
      </p>
      <h2>{tr("Какие данные используются")}</h2>
      <p>
        {tr(
          "ФИО, дата рождения, класс и дисциплины учеников, название и город центра, ФИО, телефон и email учителя, а также имена педагогов для благодарственных сертификатов.",
        )}
      </p>
      <h2>{tr("Для чего нужны данные")}</h2>
      <p>
        {tr(
          "Для учёта участников, связи с представителем центра, подготовки протокола олимпиады и сертификатов. Доступ к заявкам получают только авторизованные организаторы.",
        )}
      </p>
      <h2>{tr("Доступ к результатам")}</h2>
      <p>
        {tr(
          "Баллы и награды доступны организаторам в закрытом кабинете. Организатор готовит отдельный Excel с результатами для каждого образовательного центра. Имена учеников, баллы, места, контакты и даты рождения не публикуются в открытом архиве сайта.",
        )}
      </p>
      <h2>{tr("Автоматический выбор языка")}</h2>
      <p>
        {tr(
          "Страна определяется приблизительно по IP-адресу на сервере. Точные координаты не запрашиваются. Выбранный вручную язык сохраняется в браузере.",
        )}
      </p>
      <h2>{tr("Согласие представителя")}</h2>
      <p>
        {tr(
          "Отправляя заявку, представитель подтверждает, что имеет необходимые согласия законных представителей учеников и педагогов на передачу указанных данных организаторам олимпиады.",
        )}
      </p>
      <div className="notice">
        {tr(
          "Для исправления или удаления данных, а также уточнения сроков их хранения напишите в личные сообщения @iqland_competitions. Укажите номер заявки и название образовательного центра, чтобы организатор мог найти нужную запись.",
        )}
      </div>
    </main>
  );
}
function PageMetadata() {
  const { language } = useLanguage();
  const { pathname } = useLocation();
  useEffect(() => {
    const title =
      pathname === "/archive"
        ? "Прошедшие олимпиады"
        : pathname === "/privacy"
          ? "Политика конфиденциальности"
          : pathname === "/login"
            ? "Кабинет организатора"
            : pathname === "/cabinet/awards"
              ? "Присвоение мест"
              : pathname === "/cabinet"
                ? "Кабинет организатора"
                : pathname.includes("register")
                  ? "Регистрация"
                  : "";
    document.title = title
      ? `${tr(title)} · IQ LAND`
      : tr("IQ LAND — Большие открытия начинаются здесь");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        tr(
          "IQ LAND — международные олимпиады по математике, английскому языку и ментальной арифметике. Зарегистрируйте команду и откройте детям мир возможностей.",
        ),
      );
  }, [language, pathname]);
  return null;
}
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth";
    if (hash) {
      const timeout = setTimeout(
        () =>
          document.getElementById(hash.slice(1))?.scrollIntoView({ behavior }),
        100,
      );
      return () => clearTimeout(timeout);
    } else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
function App() {
  const { language } = useLanguage();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  return (
    <AppContext.Provider value={{ user, setUser, authReady, notify: setToast }}>
      <BrowserRouter>
        <PageMetadata />
        <ScrollManager />
        <InteractionMotion />
        <Header />
        <div id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/archive/:id" element={<EventRecap />} />
            <Route path="/events/:id/register" element={<Registration />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cabinet" element={<Dashboard />} />
            <Route path="/cabinet/awards" element={<AwardsPage />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <main className="empty-page">
                  <h1>{tr("Страница не найдена")}</h1>
                  <Link to="/" className="btn btn-primary">
                    {tr("На главную ")}
                    <ArrowRight size={18} />
                  </Link>
                </main>
              }
            />
          </Routes>
        </div>
        <Footer />
        {toast && (
          <div className="toast" role="status">
            <Check size={18} />
            {tr(toast)}
          </div>
        )}
      </BrowserRouter>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
