"use client";

// Floating glass bottom nav (reference style): Home · Vault · AI (elevated
// gold center) · Activity · Settings. Desktop gets a plain vertical variant.

export type NavId = "overview" | "vault" | "ai" | "activity" | "settings" | "degen" | "news";

function HomeIcon({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function VaultIcon({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-2.9 7.6-7 9-4.1-1.4-7-4.6-7-9V6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 13v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function AiIcon({ s = 28 }: { s?: number }) {
  // Three sparkles: a big 4-point star with two smaller ones (top-right,
  // bottom-right), matching the reference.
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r}C${cx} ${cy - r * 0.28} ${cx + r * 0.28} ${cy} ${cx + r} ${cy}` +
    `C${cx + r * 0.28} ${cy} ${cx} ${cy + r * 0.28} ${cx} ${cy + r}` +
    `C${cx} ${cy + r * 0.28} ${cx - r * 0.28} ${cy} ${cx - r} ${cy}` +
    `C${cx - r * 0.28} ${cy} ${cx} ${cy - r * 0.28} ${cx} ${cy - r}Z`;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d={star(12.5, 15.5, 11)} fill="currentColor" />
      <path d={star(24.5, 8.5, 5)} fill="currentColor" />
      <path d={star(21.5, 22, 3)} fill="currentColor" />
    </svg>
  );
}
function ActivityIcon({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 12h4l2-6 4 12 2-6h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SettingsIcon({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DegenIcon({ s = 22 }: { s?: number }) {
  // rocket — high-risk degen vault
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3c2.6 1.3 4 4 4 7.2 0 1.9-.7 3.6-1.7 4.8L12 17.4l-2.3-2.4C8.7 13.8 8 12.1 8 10.2 8 7 9.4 4.3 12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="9.6" r="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 17.2 7.6 20.4M14.8 17.2l1.6 3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function NewsIcon({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5h13v14H6a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M17 9h3v8a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M7 9h7M7 12h7M7 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const ITEMS: { id: NavId; label: string; Icon: (p: { s?: number }) => React.ReactNode; center?: boolean }[] = [
  { id: "overview", label: "Home", Icon: HomeIcon },
  { id: "vault", label: "Vault", Icon: VaultIcon },
  { id: "ai", label: "AI", Icon: AiIcon, center: true },
  { id: "degen", label: "Degen", Icon: DegenIcon },
  { id: "news", label: "News", Icon: NewsIcon },
  { id: "activity", label: "Activity", Icon: ActivityIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<NavId, (typeof ITEMS)[number]>;

// `items` picks which entries show and in what order (default: all five).
function pick(items?: NavId[]) {
  return items ? items.map((id) => BY_ID[id]).filter(Boolean) : ITEMS;
}

export function BottomNav({
  active,
  onSelect,
  items,
}: {
  active: NavId;
  onSelect: (id: NavId) => void;
  items?: NavId[];
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5 lg:hidden">
      <div
        className="flex w-full max-w-sm items-center justify-between px-3"
        style={{
          height: 62,
          background: "rgba(20, 19, 17, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "var(--r-pill)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        }}
      >
        {pick(items).map((it) =>
          it.center ? (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              aria-label={it.label}
              className="bv-press flex items-center justify-center"
              style={{
                width: 60,
                height: 60,
                marginTop: -24,
                borderRadius: "var(--r-pill)",
                background: "var(--brand-gradient)",
                color: "var(--cta-text)",
                boxShadow: "0 10px 26px rgba(216, 180, 94, 0.5)",
                border: "3px solid var(--bg)",
              }}
            >
              <it.Icon s={28} />
            </button>
          ) : (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              aria-label={it.label}
              className="bv-press flex h-11 w-11 items-center justify-center"
              style={{ color: active === it.id ? "var(--brand)" : "var(--text-dim)" }}
            >
              <it.Icon />
            </button>
          )
        )}
      </div>
    </nav>
  );
}

export function SideNav({
  active,
  onSelect,
  items,
}: {
  active: NavId;
  onSelect: (id: NavId) => void;
  items?: NavId[];
}) {
  return (
    <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-white/5 px-3 py-8 lg:flex">
      {pick(items).map((it) => (
        <button
          key={it.id}
          onClick={() => onSelect(it.id)}
          className="bv-press flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
          style={{
            background: active === it.id ? "var(--brand-soft)" : "transparent",
            color: active === it.id ? "var(--brand)" : "var(--text-dim)",
          }}
        >
          <it.Icon s={20} />
          {it.label}
        </button>
      ))}
    </aside>
  );
}
