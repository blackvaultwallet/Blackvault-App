"use client";

// Slide-to-continue control (reference: "Get Started" pill with a draggable
// arrow knob). Drag right past 70% — or flick — to trigger; otherwise the
// knob springs back. Keyboard: Enter/Space triggers directly.

import { useRef, useState } from "react";

export function SlideToStart({
  label,
  onComplete,
}: {
  label: string;
  onComplete: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const drag = useRef({ startX: 0, startT: 0, max: 0, dx: 0, active: false });
  const [done, setDone] = useState(false);

  function setX(px: number, animate: boolean) {
    const k = knobRef.current;
    const t = trackRef.current;
    if (!k || !t) return;
    k.style.transition = animate
      ? "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)"
      : "none";
    k.style.transform = `translateX(${px}px)`;
    t.style.setProperty("--slide-p", String(drag.current.max ? px / drag.current.max : 0));
  }

  function finish() {
    setDone(true);
    setX(drag.current.max, true);
    setTimeout(onComplete, 180);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (done || drag.current.active) return; // ignore second touches mid-drag
    const t = trackRef.current;
    const k = knobRef.current;
    if (!t || !k) return;
    drag.current = {
      startX: e.clientX,
      startT: performance.now(),
      max: t.clientWidth - k.clientWidth - 8,
      dx: 0,
      active: true,
    };
    k.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || done) return;
    const dx = Math.min(Math.max(e.clientX - drag.current.startX, 0), drag.current.max);
    drag.current.dx = dx;
    setX(dx, false);
  }

  function onPointerUp() {
    if (!drag.current.active || done) return;
    drag.current.active = false;
    const { dx, max, startT } = drag.current;
    const velocity = dx / Math.max(performance.now() - startT, 1);
    // distance OR a quick flick both count
    if (dx >= max * 0.7 || (velocity > 0.5 && dx > max * 0.2)) finish();
    else setX(0, true);
  }

  return (
    <div
      ref={trackRef}
      className="relative flex h-14 w-full select-none items-center"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--r-pill)",
        touchAction: "pan-y",
      }}
    >
      {/* label fades out as the knob travels */}
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium"
        style={{
          color: "var(--text)",
          opacity: "calc(1 - var(--slide-p, 0) * 1.4)",
        }}
      >
        {label}
      </span>

      <button
        ref={knobRef}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !done) finish();
        }}
        className="absolute left-1 flex h-12 w-12 cursor-grab items-center justify-center text-lg active:cursor-grabbing"
        style={{
          background: "var(--brand-gradient)",
          color: "var(--cta-text)",
          borderRadius: "var(--r-pill)",
          boxShadow: "0 4px 14px rgba(216, 180, 94, 0.35)",
        }}
      >
        →
      </button>
    </div>
  );
}
