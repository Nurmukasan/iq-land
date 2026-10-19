import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { isLanguage } from "../../shared/i18n/languages.js";
import {
  getLanguage,
  setCurrentLanguage,
  savedLanguage,
  subscribeLanguage,
  languageStorageKey,
} from "./runtime.js";
const LanguageContext = createContext(null);
export const useLanguage = () => useContext(LanguageContext);
export default function LanguageProvider({ children }) {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    () => "en",
  );
  const revision = useRef(0);
  const setLanguage = (value) => {
    if (!isLanguage(value)) return;
    revision.current++;
    try {
      localStorage.setItem(languageStorageKey, value);
    } catch {}
    setCurrentLanguage(value);
  };
  useEffect(() => {
    if (savedLanguage()) return;
    const controller = new AbortController(),
      started = revision.current;
    const timeout = setTimeout(() => controller.abort(), 2500);
    fetch("/api/language", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Accept-Language": (navigator.languages || [navigator.language]).join(
          ",",
        ),
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (
          !controller.signal.aborted &&
          started === revision.current &&
          !savedLanguage() &&
          isLanguage(data?.language)
        )
          setCurrentLanguage(data.language);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === languageStorageKey && isLanguage(event.newValue)) {
        revision.current++;
        setCurrentLanguage(event.newValue);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
