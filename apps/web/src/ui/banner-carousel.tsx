"use client";

// Promo/info banner carousel. Auto-advances every 5s; drag left/right to
// change manually. Images are 3:1 (see public/banners/*.png).

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const BANNERS = [
  { src: "/banners/balance.png", alt: "Your balance, invisible" },
  { src: "/banners/send.png", alt: "Send without a trace" },
  { src: "/banners/keys.png", alt: "Your keys, your vault" },
  { src: "/banners/degen.png", alt: "Private Degen — soon" },
];

const AUTO_MS = 5000;

export function BannerCarousel() {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, active: false });
  const wrapRef = useRef<HTMLDivElement>(null);

  // auto-advance, paused while dragging
  useEffect(() => {
    if (drag.current.active) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), AUTO_MS);
    return () => clearInterval(t);
  }, [index]);

  function go(next: number) {
    setIndex((next + BANNERS.length) % BANNERS.length);
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { startX: e.clientX, active: true };
    setDragging(true);
    wrapRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    setDragX(e.clientX - drag.current.startX);
  }
  function onPointerUp() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    const dx = dragX;
    setDragX(0);
    const w = wrapRef.current?.clientWidth ?? 300;
    if (dx < -w * 0.2) go(index + 1);
    else if (dx > w * 0.2) go(index - 1);
  }

  return (
    <div className="select-none my-2">
      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full cursor-grab overflow-hidden active:cursor-grabbing"
        style={{
          aspectRatio: "2172 / 724",
          borderRadius: "var(--r-card)",
          touchAction: "pan-y",
        }}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
            transition: dragging ? "none" : "transform 450ms var(--ease-out)",
          }}
        >
          {BANNERS.map((b) => (
            <div key={b.src} className="relative h-full w-full shrink-0">
              <Image
                src={b.src}
                alt={b.alt}
                fill
                sizes="(max-width: 640px) 100vw, 480px"
                className="object-cover"
                draggable={false}
                priority
              />
            </div>
          ))}
        </div>
      </div>

      {/* dots */}
      <div className="mt-3 flex justify-center gap-2">
        {BANNERS.map((_, i) => (
          <button
            key={i}
            aria-label={`Banner ${i + 1}`}
            onClick={() => go(i)}
            className="h-1.5 rounded-full"
            style={{
              width: i === index ? 20 : 6,
              background: i === index ? "var(--brand)" : "var(--border-strong)",
              transition:
                "width var(--t-fade) var(--ease-out), background var(--t-fade) ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
