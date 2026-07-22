"use client";

// News Hub: an interactive vertical card deck of crypto headlines. Swipe/scroll
// up-down to move between cards; a card behind peeks through for the stacked
// look. Category tabs (News / Trending), source filter chips (All / CoinDesk /
// … / X), a search toggle, thumbnails (proxied through /api/news/img so the
// image CDN never sees the user), and a live refresh every 60s. Max 20 cards.

import { useEffect, useRef, useState } from "react";

interface Item {
  title: string;
  link: string;
  source: string;
  ts: number;
  image: string | null;
  author?: string;
  handle?: string;
}

const SOURCES = ["All", "CoinDesk", "Cointelegraph", "Decrypt", "Bitcoin Magazine", "X"] as const;

const SOURCE_COLOR: Record<string, string> = {
  CoinDesk: "#f7a600",
  Cointelegraph: "#fabb18",
  Decrypt: "#22d3ee",
  "Bitcoin Magazine": "#f7931a",
  X: "#e7e7e7",
};

function relTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const proxied = (u: string | null) => (u ? `/api/news/img?url=${encodeURIComponent(u)}` : null);

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </svg>
  );
}

export function EvmNews() {
  const [tab, setTab] = useState<"news" | "trending">("news");
  const [source, setSource] = useState<string>("All");
  const [q, setQ] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [news, setNews] = useState<Item[] | null>(null);
  const [xPosts, setXPosts] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);

  // realtime news
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(`/api/news?tab=${tab}`)
        .then((r) => r.json())
        .then((d) => active && setNews(d.items ?? []))
        .catch(() => active && setNews([]));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [tab]);

  // curated X (once)
  useEffect(() => {
    let active = true;
    fetch("/api/x")
      .then((r) => r.json())
      .then(
        (d) =>
          active &&
          setXPosts(
            (d.items ?? []).map((p: { author: string; handle: string; text: string; url: string }) => ({
              title: p.text,
              link: p.url,
              source: "X",
              ts: Date.now(),
              image: null,
              author: p.author,
              handle: p.handle,
            }))
          )
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const base = source === "X" ? xPosts : (news ?? []).filter((a) => source === "All" || a.source === source);
  const list = base.filter((a) => !q || (a.title ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 20);

  useEffect(() => {
    queueMicrotask(() => setIdx(0));
  }, [tab, source, q]);

  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ y: 0, active: false });
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advTimer.current) clearTimeout(advTimer.current); }, []);

  function setY(dy: number, anim: boolean) {
    const c = cardRef.current;
    if (!c) return;
    c.style.transition = anim ? "transform 240ms var(--ease-out), opacity 240ms var(--ease-out)" : "none";
    c.style.transform = `translateY(${dy}px)`;
    c.style.opacity = String(Math.max(1 - Math.abs(dy) / 500, 0.5));
  }
  function advance(dir: 1 | -1) {
    setY(dir === 1 ? -window.innerHeight : window.innerHeight, true);
    if (advTimer.current) clearTimeout(advTimer.current);
    advTimer.current = setTimeout(() => {
      setIdx((i) => Math.min(Math.max(i + dir, 0), list.length - 1));
      setY(0, false);
    }, 170);
  }
  function onDown(e: React.PointerEvent) {
    if (drag.current.active) return;
    drag.current = { y: e.clientY, active: true };
    cardRef.current?.setPointerCapture(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current.active) return;
    setY(e.clientY - drag.current.y, false);
  }
  function onUp(e: React.PointerEvent) {
    if (!drag.current.active) return;
    drag.current.active = false;
    const dy = e.clientY - drag.current.y;
    if (dy < -70 && idx < list.length - 1) advance(1);
    else if (dy > 70 && idx > 0) advance(-1);
    else setY(0, true);
  }

  const i = Math.min(idx, Math.max(0, list.length - 1));
  const front = list[i];
  // Stacked look: front + up to 3 behind, peeking upward, narrower + fainter.
  const STACK = [
    { top: 40, inset: 0, op: 1, z: 4 },
    { top: 25, inset: 12, op: 0.5, z: 3 },
    { top: 12, inset: 24, op: 0.28, z: 2 },
    { top: 1, inset: 34, op: 0.14, z: 1 },
  ];

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-md flex-col gap-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">News Hub</h1>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--positive)" }} /> live
          </span>
        </div>
        <button
          onClick={() => setSearchOn((s) => !s)}
          aria-label="Search"
          className="bv-press flex h-10 w-10 items-center justify-center"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)", color: searchOn ? "var(--brand)" : "var(--text-dim)" }}
        >
          <SearchIcon />
        </button>
      </div>

      {searchOn && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search headlines…"
          autoFocus
          className="bv-rise bv-input px-3 py-2.5 text-sm"
        />
      )}

      {/* category tabs — a gold pill slides between the segments */}
      <div
        className="relative grid grid-cols-2 p-1"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-pill)" }}
      >
        <span
          aria-hidden
          className="absolute bottom-1 left-1 top-1"
          style={{
            width: "calc(50% - 4px)",
            background: "var(--brand-gradient)",
            borderRadius: "var(--r-pill)",
            transform: tab === "news" ? "translateX(0)" : "translateX(100%)",
            transition: "transform 280ms var(--ease-out)",
          }}
        />
        {(["news", "trending"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative z-10 h-8 text-xs font-semibold capitalize"
            style={{
              borderRadius: "var(--r-pill)",
              color: tab === t ? "var(--cta-text)" : "var(--text-dim)",
              transition: "color 220ms ease",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* source chips */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {SOURCES.map((s) => {
          const active = source === s;
          return (
            <button
              key={s}
              onClick={() => setSource(s)}
              className="bv-press flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{
                background: active ? "var(--brand-soft)" : "var(--surface-2)",
                border: `1px solid ${active ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                borderRadius: "var(--r-pill)",
                color: active ? "var(--brand)" : "var(--text-dim)",
                transition: "background 220ms ease, border-color 220ms ease, color 220ms ease",
              }}
            >
              {s !== "All" && (
                <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[s] ?? "var(--text-faint)" }} />
              )}
              {s}
            </button>
          );
        })}
      </div>

      {/* card deck */}
      <div className="relative min-h-0 flex-1">
        {news === null && source !== "X" ? (
          <div className="h-full w-full animate-pulse rounded-2xl" style={{ background: "var(--surface-2)" }} />
        ) : list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl text-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <span className="text-sm" style={{ color: "var(--text-dim)" }}>
              {source === "X" ? "No curated X posts yet." : "No headlines right now."}
            </span>
          </div>
        ) : (
          <>
            {/* behind cards, stacked upward */}
            {[3, 2, 1].map((d) => {
              const it = list[i + d];
              const s = STACK[d];
              if (!it) return null;
              return (
                <div
                  key={`peek-${d}-${it.link}`}
                  className="absolute"
                  style={{ top: s.top, bottom: 8, left: s.inset, right: s.inset, opacity: s.op, zIndex: s.z, pointerEvents: "none" }}
                >
                  <NewsCard item={it} />
                </div>
              );
            })}
            {/* front card (draggable) */}
            {front && (
              <div
                ref={cardRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
                style={{ top: STACK[0].top, bottom: 8, left: 0, right: 0, zIndex: STACK[0].z }}
              >
                <NewsCard item={front} />
              </div>
            )}
            {/* counter + hint */}
            <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex flex-col items-center gap-1">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(0,0,0,0.5)", color: "var(--text-dim)", backdropFilter: "blur(6px)" }}>
                {i + 1} / {list.length} · swipe ↕
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewsCard({ item }: { item: Item }) {
  const img = proxied(item.image);
  const color = SOURCE_COLOR[item.source] ?? "var(--brand)";
  return (
    <div
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{
        background: "var(--surface-solid)",
        border: "1px solid var(--border-strong)",
        borderRadius: 20,
        boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
      }}
    >
      {/* thumbnail */}
      <div className="relative w-full shrink-0" style={{ height: "46%", background: "var(--surface-2)" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(150deg, ${color}22, transparent 70%), var(--surface-2)` }}>
            <span className="text-3xl font-bold opacity-30" style={{ color }}>
              {item.source === "X" ? "𝕏" : item.source[0]}
            </span>
          </div>
        )}
        <span
          className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(8px)" }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {item.source}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {item.author ? `@${item.handle} · ` : ""}
          {relTime(item.ts)}
        </span>
        <p className="text-lg font-semibold leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.title}
        </p>
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          className="bv-press mt-auto flex h-10 items-center justify-center gap-1.5 text-sm font-semibold"
          style={{ background: "rgba(216,180,94,0.12)", border: "1px solid rgba(216,180,94,0.3)", borderRadius: "var(--r-pill)", color: "var(--brand)" }}
        >
          {item.source === "X" ? "View on X" : "Read article"} ↗
        </a>
      </div>
    </div>
  );
}
