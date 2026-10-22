import React from "react";
import { ArrowUpRight, FileText, Trash2 } from "lucide-react";
import { tr, getIntlLocale } from "../i18n/runtime.js";
import { sanitizeEventDocuments, documentExtension } from "../../shared/event-documents.js";
import "./EventDocuments.css";

export function documentSize(size) {
  const mb = size >= 1024 * 1024;
  return new Intl.NumberFormat(getIntlLocale(), { maximumFractionDigits: 1 }).format(
    size / (mb ? 1024 * 1024 : 1024),
  ) + " " + tr(mb ? "МБ" : "КБ");
}
export default function EventDocuments({ documents, onRemove, disabled = false }) {
  const files = sanitizeEventDocuments(documents);
  if (!files.length) return null;
  return (
    <section className="event-documents" aria-label={tr("Критерии и документы олимпиады")}>
      <h3>{tr("Критерии и документы олимпиады")}</h3>
      <p>{tr("Файлы откроются в новой вкладке. Word и другие офисные документы могут скачиваться.")}</p>
      <ul>
        {files.map((file) => (
          <li key={file.url}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" aria-label={tr("Открыть файл {0} в новой вкладке", [file.name])}>
              <FileText size={22} aria-hidden="true" />
              <span>
                <strong>{file.name}</strong>
                <small>{documentExtension(file.url).toUpperCase()} · {documentSize(file.size)}</small>
              </span>
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
            {onRemove && (
              <button type="button" className="icon-btn" disabled={disabled} onClick={() => onRemove(file.url)} aria-label={tr("Убрать файл {0}", [file.name])}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
