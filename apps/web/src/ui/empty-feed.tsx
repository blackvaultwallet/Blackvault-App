"use client";

// Empty state for the private feed. Keeps the stacked-card look (two ghost
// cards peeking behind) with a muted notif-shaped row — icon, "No coin
// transfer", and placeholder value / date strips — so the layout never
// collapses to bare text.

function Strip({ w, h = 8 }: { w: number; h?: number }) {
  return <span className="block rounded-full" style={{ width: w, height: h, background: "var(--border)" }} />;
}

export function EmptyFeed() {
  return (
    <div className="relative">
      {/* ghost cards behind */}
      {[1, 2].map((d) => (
        <div
          key={d}
          aria-hidden
          className="absolute inset-0"
          style={{
            transform: `translateY(${d * 7}px) scale(${1 - d * 0.035})`,
            transformOrigin: "top center",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-card)",
            opacity: 1 - d * 0.3,
            zIndex: 2 - d,
          }}
        />
      ))}

      <div
        className="relative flex items-center gap-3 px-3 py-3"
        style={{
          zIndex: 2,
          background: "var(--surface-2)",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--r-card)",
        }}
      >
        {/* icon */}
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center text-sm"
          style={{
            background: "var(--surface-solid)",
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--r-pill)",
            color: "var(--text-faint)",
          }}
        >
          ⇅
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
            No coin transfer
          </span>
          <Strip w={104} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Strip w={48} h={10} />
          <Strip w={30} />
        </div>
      </div>
    </div>
  );
}
