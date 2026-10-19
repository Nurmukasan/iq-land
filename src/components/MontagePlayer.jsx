import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import EventPhoto from "./EventPhoto";
import "./MontagePlayer.css";

export default function MontagePlayer({ src, poster, title }) {
  const player = useRef(null);
  const [muted, setMuted] = useState(true);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highDefinition, setHighDefinition] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMuted(true);
    setNeedsPlay(false);
    setFailed(false);
    setHighDefinition(false);
    const video = player.current;
    if (video && src) {
      video.muted = true;
      video.play().catch(() => {
        if (!cancelled) setNeedsPlay(true);
      });
    }
    return () => {
      cancelled = true;
      video?.pause();
    };
  }, [src]);

  async function play() {
    try {
      await player.current?.play();
      setNeedsPlay(false);
    } catch {
      setNeedsPlay(true);
    }
  }

  return (
    <div className={"montage-player" + (!src ? " montage-placeholder" : "")}>
      {src ? (
        <>
          <video
            key={src}
            ref={player}
            src={src}
            poster={poster || undefined}
            aria-label={"Видео олимпиады: " + title}
            autoPlay
            loop
            muted={muted}
            playsInline
            controls
            preload="metadata"
            onPlaying={() => setNeedsPlay(false)}
            onPause={() => setNeedsPlay(true)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              setHighDefinition(
                Math.max(video.videoWidth, video.videoHeight) >= 1920 &&
                  Math.min(video.videoWidth, video.videoHeight) >= 1080,
              );
            }}
            onError={() => setFailed(true)}
          />
          {!failed && (
            <div className="montage-toolbar">
              <span className="montage-label">
                <Play size={12} fill="currentColor" /> Моменты олимпиады{" "}
                {highDefinition && <small>Full HD</small>}
              </span>
              <button
                type="button"
                className="montage-sound"
                aria-label={muted ? "Включить звук" : "Выключить звук"}
                onClick={() => {
                  if (player.current) player.current.muted = !muted;
                  setMuted(!muted);
                }}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                <span>{muted ? "Включить звук" : "Звук включён"}</span>
              </button>
            </div>
          )}
          {failed ? (
            <div className="montage-message" role="status">
              <p>Не удалось воспроизвести видео</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setFailed(false);
                  setNeedsPlay(false);
                  player.current?.load();
                  play();
                }}
              >
                <RotateCcw size={17} /> Повторить
              </button>
            </div>
          ) : (
            needsPlay && (
              <button
                className="montage-play"
                type="button"
                aria-label="Воспроизвести монтаж"
                onClick={play}
              >
                <Play size={28} fill="currentColor" />
              </button>
            )
          )}
        </>
      ) : (
        <>
          <EventPhoto
            src={poster}
            alt={"Олимпиада IQ LAND · " + title}
            className="montage-poster"
          />
          <div className="montage-poster-caption">
            <span>Моменты, которые остаются.</span>
            <p>История одной олимпиады.</p>
          </div>
        </>
      )}
    </div>
  );
}
