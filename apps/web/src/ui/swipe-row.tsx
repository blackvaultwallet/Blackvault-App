"use client";

// Telegram-style swipe-left row: drag the content aside to reveal actions on
// the right. Pointer events, so it works with touch, mouse and pen alike.
//
// Two things it has to get right or it feels broken. The gesture must not steal
// vertical scrolling, so the first few pixels decide whether this is a swipe or
// the page moving. And only one row may sit open at a time — hence `openId`,
// lifted to the caller rather than kept per row.

import { useEffect, useRef, useState } from "react";

export interface SwipeAction {
  label: string;
  icon: React.ReactNode;
  /** Background of the action panel — Telegram tints these by meaning. */
  bg: string;
  onSelect: () => void;
}

const ACTION_WIDTH = 76;
/** Pixels of travel before we commit to a direction. */
const SLOP = 8;

export function SwipeRow({
  id,
  openId,
  onOpenChange,
  actions,
  children,
  style,
}: {
  id: string;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  actions: SwipeAction[];
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const open = openId === id;
  const width = actions.length * ACTION_WIDTH;
  const [dx, setDx] = useState(0);
  // `dragging` mirrors the ref in state because render needs it (to drop the
  // transition mid-gesture) and refs must not be read during render.
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, active: false, decided: false, horizontal: false });

  useEffect(() => {
    if (!drag.current.active) setDx(open ? width : 0);
  }, [open, width]);

  function down(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, active: true, decided: false, horizontal: false };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    const deltaX = d.x - e.clientX;
    const deltaY = Math.abs(d.y - e.clientY);

    if (!d.decided) {
      if (Math.abs(deltaX) < SLOP && deltaY < SLOP) return;
      d.decided = true;
      // A mostly-vertical first move belongs to the scroller, not to us.
      d.horizontal = Math.abs(deltaX) > deltaY;
      if (d.horizontal) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (!d.horizontal) return;

    const base = open ? width : 0;
    // Slight overshoot allowed so the drag doesn't feel walled off.
    setDx(Math.max(0, Math.min(width + 12, base + deltaX)));
  }

  function up() {
    const d = drag.current;
    d.active = false;
    setDragging(false);
    // Nothing moved past the slop — treat it as a tap. Swiping alone isn't
    // discoverable, so a tap opens the same actions.
    if (!d.decided) {
      onOpenChange(open ? null : id);
      return;
    }
    if (!d.horizontal) return;
    onOpenChange(dx > width / 2 ? id : null);
  }

  return (
    <div className="relative overflow-hidden" style={{ ...style, touchAction: "pan-y" }}>
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => {
              onOpenChange(null);
              a.onSelect();
            }}
            className="bv-press flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
            style={{ width: ACTION_WIDTH, background: a.bg, color: "#fff" }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{
          transform: `translateX(${-dx}px)`,
          transition: dragging ? "none" : "transform 220ms var(--ease-out)",
          background: "var(--bg)",
          cursor: "pointer",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export const PlusIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const MinusIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const TrashIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
  </svg>
);
