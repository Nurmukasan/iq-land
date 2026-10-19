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
} from "lucide-react";
import "@fontsource-variable/golos-text";
import "@fontsource-variable/unbounded";
import "./styles.css";
import Home from "./pages/Home";
import Registration from "./pages/Registration";
import Dashboard, { Login } from "./pages/Dashboard";
import InteractionMotion from "./components/InteractionMotion";

export async function api(url, options = {}) {
  let res;
  try {
    res = await fetch("/api" + url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
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
export const dateLabel = (v) =>
  new Date(v + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export const priceLabel = (e) =>
  e.price === null
    ? "Стоимость уточняется"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: e.currency,
        maximumFractionDigits: 0,
      }).format(e.price);
const AppContext = createContext();
export const useApp = () => useContext(AppContext);
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Загрузка…
    </div>
  );
}
export function ErrorBox({ children }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
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
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X />
          </button>
        </div>
        {children}
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
          К содержимому
        </a>
        <Link to="/" aria-label="IQ LAND — главная" className="brand">
          <img src="/images/logo.svg" alt="IQ LAND" />
        </Link>
        <nav
          id="primary-navigation"
          className={open ? "nav-links is-open" : "nav-links"}
          aria-label="Главная навигация"
        >
          <Link to="/#events">Олимпиады</Link>
          <Link to="/register">Регистрация</Link>
          <Link to="/#teachers">Учителям</Link>
          <Link to="/#about">Зачем IQ LAND</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-cta" to="/#events">
            Выбрать олимпиаду <ArrowUpRight size={18} />
          </Link>
          <Link
            className="btn-nav"
            aria-label="Личный кабинет"
            to={user ? "/cabinet" : "/login"}
          >
            <LogIn size={19} />
            <span>Кабинет</span>
          </Link>
          <button
            ref={menuButton}
            className="icon-btn mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Открыть меню"
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
            Объединяем знания.
            <br />
            Открываем мир.
          </p>
          <div>
            <Link to="/#events">Олимпиады</Link>
            <Link to="/#teachers">Для учителей</Link>
          </div>
          <div>
            <Link to="/#faq">Вопросы и ответы</Link>
            <Link to="/login">
              Кабинет организатора <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} IQ LAND. Все права защищены.
          </span>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <span>С заботой о больших мечтах</span>
        </div>
      </div>
    </footer>
  );
}
function Privacy() {
  return (
    <main className="container prose-page">
      <Link className="back-link" to="/">
        ← На главную
      </Link>
      <span className="eyebrow">IQ LAND</span>
      <h1>Обработка персональных данных</h1>
      <p>
        Форма регистрации предназначена для совершеннолетних учителей и
        представителей образовательных центров. Ученик самостоятельно заявку не
        подаёт.
      </p>
      <h2>Какие данные используются</h2>
      <p>
        ФИО, дата рождения, класс и дисциплины учеников, название и город
        центра, ФИО, телефон и email учителя, а также имена педагогов для
        благодарственных сертификатов.
      </p>
      <h2>Для чего нужны данные</h2>
      <p>
        Для учёта участников, связи с представителем центра, подготовки
        протокола олимпиады и сертификатов. Доступ к заявкам получают только
        авторизованные организаторы.
      </p>
      <h2>Согласие представителя</h2>
      <p>
        Отправляя заявку, представитель подтверждает, что имеет необходимые
        согласия законных представителей учеников и педагогов на передачу
        указанных данных организаторам олимпиады.
      </p>
      <div className="notice">
        Перед публичным запуском организатору необходимо указать юридическое
        лицо, контакт для обращений по данным и сроки хранения. Эта версия
        предназначена для ознакомления с функциональностью; используйте тестовые
        данные.
      </div>
    </main>
  );
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
        <ScrollManager />
        <InteractionMotion />
        <Header />
        <div id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/events/:id/register" element={<Registration />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cabinet" element={<Dashboard />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <main className="empty-page">
                  <h1>Страница не найдена</h1>
                  <Link to="/" className="btn btn-primary">
                    На главную <ArrowRight size={18} />
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
            {toast}
          </div>
        )}
      </BrowserRouter>
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
