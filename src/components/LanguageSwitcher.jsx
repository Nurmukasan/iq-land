import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LANGUAGES } from "../../shared/i18n/languages.js";
import { tr } from "../i18n/runtime.js";
import { useLanguage } from "../i18n/LanguageProvider";
import "./LanguageSwitcher.css";
export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef(null),
    trigger = useRef(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('[aria-checked="true"]')?.focus();
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="language-switcher"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
          event.stopPropagation();
        }
        if (
          open &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const items = [
            ...root.current.querySelectorAll('[role="menuitemradio"]'),
          ];
          const at = items.indexOf(document.activeElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                  items.length;
          items[next]?.focus();
        }
        if (event.key === "Tab") setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="language-trigger"
        type="button"
        aria-label={tr("Язык сайта")}
        aria-haspopup="menu"
        aria-controls={id}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages size={18} />
        <span>{language.toUpperCase()}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="language-menu"
          role="menu"
          aria-label={tr("Выбрать язык")}
          id={id}
        >
          <span className="language-menu-caption">{tr("Язык сайта")}</span>
          {LANGUAGES.map((item) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={item.code === language}
              lang={item.code}
              key={item.code}
              onClick={() => {
                setLanguage(item.code);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span>{item.name}</span>
              <small>{item.code.toUpperCase()}</small>
              {item.code === language && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
