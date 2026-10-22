import React, { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";
import { api } from "../main";
import { tr } from "../i18n/runtime.js";
import { DOCUMENT_ACCEPT, DOCUMENT_TYPES, documentExtension, MAX_DOCUMENT_BYTES, MAX_EVENT_DOCUMENTS } from "../../shared/event-documents.js";
import EventDocuments from "./EventDocuments";

export default function EventDocumentsUploader({ value, onChange, onBusyChange, disabled }) {
  const inputId = useId();
  const input = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(null), mounted = useRef(false), current = useRef(value);
  current.current = value;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);
  async function upload(files) {
    if (active.current || disabled || !files.length) return;
    setError("");
    if (files.length + current.current.length > MAX_EVENT_DOCUMENTS) {
      setError("Не более 10 файлов для одной олимпиады.");
      return;
    }
    if (files.some((file) => !Object.hasOwn(DOCUMENT_TYPES, documentExtension(file.name)))) {
      setError("Поддерживаются PDF, Word, Excel, PowerPoint, RTF и TXT.");
      return;
    }
    if (files.some((file) => file.size > MAX_DOCUMENT_BYTES)) {
      setError("Файл слишком большой. Максимальный размер — 20 МБ.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    onBusyChange(true);
    try {
      for (const file of files) {
        const result = await api("/event-documents", {
          method: "POST", body: file, signal: controller.signal,
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        });
        if (!mounted.current) return;
        current.current = [...current.current, result];
        onChange(current.current);
      }
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      active.current = null;
      if (mounted.current) { setBusy(false); onBusyChange(false); }
    }
  }
  return (
    <div className="event-documents-uploader" aria-busy={busy}>
      <label htmlFor={inputId}>{tr("Файлы с критериями · необязательно")}</label>
      <p id={inputId + "-help"}>{tr("Добавьте критерии, положение или инструкцию. До 10 файлов, каждый до 20 МБ. Они появятся в афише и после регистрации на эту олимпиаду.")}</p>
      <input ref={input} id={inputId} type="file" accept={DOCUMENT_ACCEPT} multiple hidden disabled={disabled || busy || value.length >= MAX_EVENT_DOCUMENTS} aria-describedby={inputId + "-help"} onChange={(event) => {
        const files = [...event.target.files];
        event.target.value = "";
        upload(files);
      }} />
      <button type="button" className="btn btn-secondary btn-small" disabled={disabled || busy || value.length >= MAX_EVENT_DOCUMENTS} onClick={() => input.current?.click()}>
        <UploadCloud size={18} aria-hidden="true" /> {tr("Добавить файлы")}
      </button>
      <small>{tr("PDF, Word, Excel, PowerPoint, RTF, TXT")}</small>
      {busy && <p className="document-upload-status" role="status"><LoaderCircle size={17} className="spin" />{tr("Загружаю файлы…")}</p>}
      {error && <p className="document-upload-error" role="alert">{tr(error)}</p>}
      <EventDocuments documents={value} disabled={busy || disabled} onRemove={(url) => { onChange(value.filter((file) => file.url !== url)); setError(""); }} />
      {!!value.length && <small>{tr("Чтобы убрать файл с сайта, удалите его из списка и сохраните мероприятие.")}</small>}
    </div>
  );
}
