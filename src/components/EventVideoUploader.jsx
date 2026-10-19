import { tr } from "../i18n/runtime.js";
import React, { useEffect, useId, useRef, useState } from "react";
import { Check, Film, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import "./EventVideoUploader.css";

const videoTypes = ["video/mp4", "video/webm"];
const maxVideoBytes = 1024 * 1024 * 1024;

export default function EventVideoUploader({
  value = "",
  onChange,
  onBusyChange,
  disabled = false,
}) {
  const inputId = useId();
  const input = useRef(null),
    request = useRef(null),
    localUrl = useRef(""),
    generation = useRef(0),
    mounted = useRef(false);
  const [preview, setPreview] = useState(""),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState(""),
    [dragging, setDragging] = useState(false),
    [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current?.abort();
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    };
  }, []);

  function clearPreview() {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = "";
    setPreview("");
    setPreviewError(false);
  }

  function stopCurrentUpload() {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    clearPreview();
    setUploading(false);
    onBusyChange?.(false);
    setProgress(0);
    setFileName("");
    setError("");
  }

  function upload(file) {
    if (!file || disabled) return;
    stopCurrentUpload();
    if (!videoTypes.includes(file.type)) {
      setError("Выберите видео MP4 (H.264) или WebM.");
      return;
    }
    if (!file.size) {
      setError("Файл пустой. Выберите другое видео.");
      return;
    }
    if (file.size > maxVideoBytes) {
      setError("Видео больше 1 ГБ. Выберите файл меньшего размера.");
      return;
    }

    const attempt = ++generation.current;
    const xhr = new XMLHttpRequest();
    const isCurrent = () => mounted.current && generation.current === attempt;
    request.current = xhr;
    const objectUrl = URL.createObjectURL(file);
    localUrl.current = objectUrl;
    setPreview(objectUrl);
    setFileName(file.name);
    setUploading(true);
    onBusyChange?.(true);

    function finish() {
      request.current = null;
      setUploading(false);
      onBusyChange?.(false);
    }
    function fail(message) {
      if (!isCurrent()) return;
      clearPreview();
      setFileName("");
      setError(message);
      finish();
    }
    xhr.upload.onprogress = (event) => {
      if (!isCurrent()) return;
      const total = event.lengthComputable ? event.total : file.size;
      setProgress(Math.min(99, Math.round((event.loaded / total) * 100)));
    };
    xhr.onload = () => {
      if (!isCurrent()) return;
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        fail("Не удалось завершить загрузку. Попробуйте ещё раз.");
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(
          typeof data?.error === "string"
            ? data.error
            : "Не удалось загрузить видео. Попробуйте ещё раз.",
        );
        return;
      }
      if (
        typeof data?.url !== "string" ||
        !data.url.startsWith("/api/event-videos/")
      ) {
        fail("Сервер не вернул видео. Попробуйте загрузить его ещё раз.");
        return;
      }
      onChange(data.url);
      clearPreview();
      setProgress(100);
      finish();
    };
    xhr.onerror = () =>
      fail("Загрузка прервалась. Проверьте соединение и попробуйте ещё раз.");
    xhr.ontimeout = () =>
      fail("Не удалось загрузить видео. Попробуйте ещё раз.");
    xhr.onabort = () => {
      if (isCurrent()) {
        clearPreview();
        setFileName("");
        finish();
      }
    };
    try {
      xhr.open("POST", "/api/event-videos");
      // The relative URL keeps both the file and session cookie on this site.
      xhr.withCredentials = true;
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    } catch {
      fail("Не удалось начать загрузку. Попробуйте выбрать файл ещё раз.");
    }
  }

  const source = preview || value;
  return (
    <section
      className={
        "event-video-upload" +
        (dragging ? " is-dragging" : "") +
        (error ? " has-error" : "")
      }
      aria-label={tr("Монтаж олимпиады")}
      aria-busy={uploading}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files[0]);
      }}
    >
      <div className="event-video-upload-heading">
        <Film size={24} />
        <div>
          <h3>{tr("Монтаж олимпиады")}</h3>
          <p>
            {tr("Покажите, как прошёл день: участники, эмоции и награждение.")}
          </p>
        </div>
      </div>
      <div className="event-video-upload-preview">
        {source ? (
          <video
            key={source}
            src={source}
            controls
            muted
            playsInline
            preload="metadata"
            aria-label={tr("Предпросмотр монтажа олимпиады")}
            onError={() => setPreviewError(true)}
          />
        ) : (
          <div className="event-video-upload-empty">
            <Film size={38} strokeWidth={1.25} />
            <span>{tr("Ваш день в одном видео")}</span>
          </div>
        )}
      </div>
      {previewError && (
        <p className="event-video-preview-error">
          {tr(
            "Браузер не смог воспроизвести предпросмотр. Для MP4 используйте кодек H.264 или выберите WebM.",
          )}
        </p>
      )}
      <input
        ref={input}
        id={inputId}
        className="event-video-file-input"
        type="file"
        accept={videoTypes.join(",")}
        aria-label={tr("Загрузить монтаж олимпиады")}
        aria-describedby={inputId + "-hint"}
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          upload(file);
        }}
      />
      <div className="event-video-upload-actions">
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <UploadCloud size={17} />
          {tr(source ? "Заменить видео" : "Выбрать видео")}
        </button>
        {source && (
          <button
            className="text-link event-video-remove"
            type="button"
            disabled={disabled}
            onClick={() => {
              stopCurrentUpload();
              onChange("");
            }}
          >
            <Trash2 size={16} />
            {tr(" Убрать видео")}
          </button>
        )}
      </div>
      <p id={inputId + "-hint"} className="event-video-upload-hint">
        {tr("MP4 (H.264) или WebM · до 1 ГБ. Можно перетащить файл сюда.")}
        <span>
          {tr(
            "Оригинальное качество, включая 1080p60, сохраняется без конвертации.",
          )}
        </span>
      </p>
      {uploading && (
        <div className="event-video-upload-progress">
          <div className="event-video-progress-label" role="status">
            <span>
              <RefreshCw size={15} className="spin" />
              {tr(progress >= 99 ? "Завершаем загрузку…" : "Загружаем видео…")}
            </span>
            <strong>{tr(progress)}%</strong>
          </div>
          <div
            className="event-video-progress-bar"
            role="progressbar"
            aria-label={tr("Загрузка видео")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {!uploading && fileName && (
        <p className="event-video-upload-success" role="status">
          <Check size={16} />
          {tr(" Видео загружено ")}
          <span>{tr(fileName)}</span>
        </p>
      )}
      {error && (
        <p className="event-video-upload-error" role="alert">
          {tr(error)}
        </p>
      )}
    </section>
  );
}
