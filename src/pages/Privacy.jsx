import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../main";
import { tr } from "../i18n/runtime.js";
import { generalContact } from "../lib/contacts.js";
import { CONSENT_TEXT, PRIVACY_SECTIONS, PRIVACY_VERSION } from "../../shared/privacy.js";

export default function Privacy() {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    api("/legal").then((data) => { if (active) setDetails(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  return <main className="container prose-page">
    <Link className="back-link" to="/">{tr("← На главную")}</Link>
    <span className="eyebrow">IQ LAND</span>
    <h1>{tr("Обработка персональных данных")}</h1>
    <p className="muted">{tr("Редакция условий")}: {PRIVACY_VERSION}</p>
    <h2>{tr("Организатор и связь")}</h2>
    <p>{tr("Олимпиады проводит команда IQ LAND, Казахстан. По вопросам регистрации и обработки данных напишите в Instagram:")} <a href="https://www.instagram.com/iqland_competitions/" target="_blank" rel="noopener noreferrer">@iqland_competitions</a>.</p>
    <p><a href={generalContact.href}>{generalContact.phone}</a></p>
    {error && <p role="alert">{tr("Не удалось загрузить сведения организатора.")} <button className="text-link" onClick={() => setAttempt((n) => n + 1)}>{tr("Повторить загрузку")}</button></p>}
    {details && <dl className="legal-details">
      {[["Наименование организатора", details.name], ["ИИН / БИН", details.identifier], ["Адрес для обращений", details.address], ["Страна хранения данных", details.storageCountry]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{tr(label)}</dt><dd>{value}</dd></div>)}
      {details.email && <div><dt>Email</dt><dd><a href={`mailto:${details.email}`}>{details.email}</a></dd></div>}
    </dl>}
    {PRIVACY_SECTIONS.map(([title, body]) => <section key={title}><h2>{tr(title)}</h2><p>{tr(body)}</p></section>)}
    <h2>{tr("Согласие представителя")}</h2>
    <p>{tr(CONSENT_TEXT)}</p>
    <div className="notice">{tr("Для исправления или удаления данных, а также уточнения сроков их хранения напишите в личные сообщения @iqland_competitions. Укажите номер заявки и название образовательного центра, чтобы организатор мог найти нужную запись.")}</div>
  </main>;
}
