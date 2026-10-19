import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import "./InteractionMotion.css";

const pressTargets = ".btn, .filter-tab, .destination-nav button";

export default function InteractionMotion() {
  const progress = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const active = new Set();
    const ripples = new Set();
    let pointerFrame = 0,
      scrollFrame = 0,
      pointer;

    const reset = (element) => {
      for (const [property, value] of Object.entries({
        "--tilt-x": "0deg",
        "--tilt-y": "0deg",
        "--magnet-x": "0px",
        "--magnet-y": "0px",
        "--pointer-x": "50%",
        "--pointer-y": "50%",
      }))
        element.style.setProperty(property, value);
      active.delete(element);
    };
    const resetAll = () => {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      for (const element of active) reset(element);
    };
    const move = (event) => {
      if (reduced.matches || !fine.matches || event.pointerType === "touch")
        return;
      pointer = { target: event.target, x: event.clientX, y: event.clientY };
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (reduced.matches || !pointer?.target?.isConnected) return;
        const tilt = pointer.target.closest?.("[data-tilt]");
        const magnet = pointer.target.closest?.("[data-magnetic]");
        for (const element of [...active])
          if (element !== tilt && element !== magnet) reset(element);
        for (const element of [tilt, magnet]) {
          if (!element || element.matches(":disabled")) continue;
          const rect = element.getBoundingClientRect();
          const x = Math.min(
            1,
            Math.max(0, (pointer.x - rect.left) / rect.width),
          );
          const y = Math.min(
            1,
            Math.max(0, (pointer.y - rect.top) / rect.height),
          );
          element.style.setProperty("--pointer-x", `${x * 100}%`);
          element.style.setProperty("--pointer-y", `${y * 100}%`);
          if (element === tilt) {
            element.style.setProperty("--tilt-x", `${(0.5 - y) * 7}deg`);
            element.style.setProperty("--tilt-y", `${(x - 0.5) * 7}deg`);
          }
          if (element === magnet) {
            element.style.setProperty("--magnet-x", `${(x - 0.5) * 9}px`);
            element.style.setProperty("--magnet-y", `${(y - 0.5) * 9}px`);
          }
          active.add(element);
        }
      });
    };
    const leave = (event) => {
      for (const element of [...active])
        if (!event.relatedTarget || !element.contains(event.relatedTarget))
          reset(element);
      if (!event.relatedTarget) resetAll();
    };
    const ripple = (event) => {
      if (reduced.matches || (event.type === "click" && event.detail !== 0))
        return;
      if (event.type === "pointerdown" && event.button !== 0) return;
      const button = event.target.closest?.(pressTargets);
      if (
        !button ||
        button.matches(":disabled") ||
        typeof button.animate !== "function"
      )
        return;
      const rect = button.getBoundingClientRect();
      const wave = document.createElement("span");
      const size = Math.hypot(rect.width, rect.height) * 2;
      wave.className = "interaction-ripple";
      wave.setAttribute("aria-hidden", "true");
      Object.assign(wave.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${(event.type === "click" ? rect.width / 2 : event.clientX - rect.left) - size / 2}px`,
        top: `${(event.type === "click" ? rect.height / 2 : event.clientY - rect.top) - size / 2}px`,
      });
      button.append(wave);
      ripples.add(wave);
      const animation = wave.animate(
        [
          { transform: "scale(0)", opacity: 0.28 },
          { transform: "scale(1)", opacity: 0 },
        ],
        { duration: 620, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
      animation.finished
        .catch(() => {})
        .finally(() => {
          wave.remove();
          ripples.delete(wave);
        });
    };
    const scroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const height = document.documentElement.scrollHeight - innerHeight;
        if (progress.current)
          progress.current.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, scrollY / height)) : 0})`;
      });
    };
    const preference = () => {
      resetAll();
      for (const wave of ripples) {
        wave.getAnimations().forEach((a) => a.cancel());
        wave.remove();
      }
      ripples.clear();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    document.addEventListener("pointerdown", ripple, { passive: true });
    document.addEventListener("click", ripple);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll, { passive: true });
    window.addEventListener("blur", resetAll);
    reduced.addEventListener("change", preference);
    fine.addEventListener("change", preference);
    scroll();
    return () => {
      preference();
      cancelAnimationFrame(scrollFrame);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("pointerdown", ripple);
      document.removeEventListener("click", ripple);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("blur", resetAll);
      reduced.removeEventListener("change", preference);
      fine.removeEventListener("change", preference);
    };
  }, [pathname]);

  return <div ref={progress} className="reading-progress" aria-hidden="true" />;
}
