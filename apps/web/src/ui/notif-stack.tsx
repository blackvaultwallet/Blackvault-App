"use client";

// iOS-style notification stack. Collapsed: the newest card sits on top with a
// couple of cards peeking out below it (offset + scaled), reading as a deck.
// Tap to expand into the full list; "Show less" collapses it back.

import { useState } from "react";

export function NotifStack({ items, max = 4 }: { items: React.ReactNode[]; max?: number }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  if (open) {
    return (
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div
            key={i}
            className={`bv-rise${i === 0 ? " bv-beam" : ""}`}
            style={{ animationDelay: `${i * 30}ms`, borderRadius: "var(--r-card)" }}
          >
            {it}
          </div>
        ))}
        <button
          onClick={() => setOpen(false)}
          className="bv-press mx-auto mt-1 text-[11px]"
          style={{ color: "var(--text-faint)" }}
        >
          Show less
        </button>
      </div>
    );
  }

  // Always keep a couple ghost layers behind for the stacked deck look, even
  // with a single notification.
  const behind = Math.min(Math.max(items.length - 1, 2), max);
  return (
    <button type="button" onClick={() => setOpen(true)} className="bv-press block w-full text-left">
      <div className="relative">
        {Array.from({ length: behind }).map((_, idx) => {
          const d = idx + 1; // 1 = just behind the top card
          return (
            <div
              key={idx}
              aria-hidden
              className="absolute inset-0"
              style={{
                transform: `translateY(${d * 7}px) scale(${1 - d * 0.035})`,
                transformOrigin: "top center",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-card)",
                opacity: 1 - d * 0.28,
                zIndex: behind - d,
              }}
            />
          );
        })}
        <div className="relative bv-beam" style={{ zIndex: behind, borderRadius: "var(--r-card)" }}>
          {items[0]}
        </div>
      </div>
      <span className="mt-3 block text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        {items.length} notification{items.length > 1 ? "s" : ""} · tap to expand
      </span>
    </button>
  );
}
