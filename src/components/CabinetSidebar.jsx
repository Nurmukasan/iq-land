import { tr } from "../i18n/runtime.js";
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  ListChecks,
  CalendarDays,
  Trophy,
  Medal,
  ChevronRight,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { api, useApp } from "../main";

export default function CabinetSidebar({ active, onSection, beforeLeave }) {
  const { user, setUser, notify } = useApp();
  const navigate = useNavigate();
  const guarded = async (action) => {
    try {
      await beforeLeave?.();
      await action();
    } catch (error) {
      notify(error.message);
    }
  };
  const sections = [
    { id: "registrations", title: "Заявки команд", icon: Users },
    { id: "awards", title: "Присвоение мест", icon: Medal },
    { id: "protocol", title: "Протокол олимпиады", icon: ListChecks },
    { id: "events", title: "Мероприятия", icon: CalendarDays },
    ...(user.role === "admin"
      ? [{ id: "promo", title: "Рекламный блок", icon: Trophy }]
      : []),
  ];
  return (
    <aside className="dashboard-sidebar">
      <span className="eyebrow">{tr("РАБОЧЕЕ ПРОСТРАНСТВО")}</span>
      <div className="user-card">
        <div>{user.name[0]}</div>
        <strong>
          {user.name}
          <small>
            {tr(
              user.role === "admin"
                ? "Администратор сайта"
                : "Руководитель IQ LAND",
            )}
          </small>
        </strong>
      </div>
      <nav aria-label={tr("Разделы кабинета")}>
        {sections.map((section) => (
          <button
            key={section.id}
            className={active === section.id ? "active" : ""}
            aria-current={active === section.id ? "page" : undefined}
            onClick={() =>
              guarded(() =>
                section.id === "awards"
                  ? navigate("/cabinet/awards")
                  : onSection
                    ? onSection(section.id)
                    : navigate("/cabinet", {
                        state: { section: section.id },
                      }),
              )
            }
          >
            <section.icon size={18} />
            {tr(section.title)}
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <ShieldCheck size={22} />
        <p>
          {tr("Все заявки и результаты")}
          <br />
          {tr("в одном пространстве.")}
        </p>
        <button
          className="text-link small"
          onClick={() =>
            guarded(async () => {
              await api("/auth/logout", { method: "POST" });
              setUser(null);
            })
          }
        >
          <LogOut size={15} />
          {tr(" Выйти из кабинета")}
        </button>
      </div>
    </aside>
  );
}
