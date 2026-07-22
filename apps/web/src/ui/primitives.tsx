"use client";

// Presentational building blocks. No wallet/protocol logic here — feature
// components compose these. Restyle via src/ui/theme.css only.

import { useEffect, useRef, useState } from "react";
import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  CSSProperties,
} from "react";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`bv-card bv-enter p-5 text-left ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="bv-label">{children}</p>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "brand";
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  const skin =
    variant === "primary"
      ? "bv-btn-primary"
      : variant === "brand"
        ? "bv-btn-brand"
        : "bv-btn-ghost";
  return (
    <button
      {...rest}
      className={`bv-press ${skin} px-5 py-2.5 text-sm disabled:cursor-default ${className}`}
    />
  );
}

/** Circular quick action: icon above a tiny label (PDF-style Deposit/Withdraw row). */
export function IconAction({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className="bv-action bv-press text-lg">{icon}</span>
      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
        {label}
      </span>
    </button>
  );
}

/** Eases a numeric value toward its target for a short count-up on change. */
function useCountUp(target: number | null): number | null {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;
    if (target === null || from === null || from === target) {
      setDisplay(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }
    const start = performance.now();
    const dur = 500;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

/** Big balance figure with dimmed decimals: 25,540.23 → "25,540" bright, ".23" faint. */
export function Stat({ value, suffix }: { value: number | null; suffix?: string }) {
  const shown = useCountUp(value);
  if (shown === null) {
    return <span style={{ fontSize: "var(--fs-hero)", fontWeight: 600 }}>—</span>;
  }
  const [int, frac] = shown.toFixed(shown >= 1000 ? 2 : 4).split(".");
  const intFmt = Number(int).toLocaleString("en-US");
  return (
    <span
      className="font-mono tabular-nums"
      style={{ fontSize: "var(--fs-hero)", fontWeight: 600, letterSpacing: "-0.02em" }}
    >
      {intFmt}
      <span style={{ color: "var(--text-faint)" }}>.{frac}</span>
      {suffix && (
        <span style={{ fontSize: "1rem", color: "var(--text-dim)", marginLeft: 6 }}>
          {suffix}
        </span>
      )}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="bv-label"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
        padding: "2px 10px",
      }}
    >
      {children}
    </span>
  );
}

/** Asset row: icon circle · name/ticker · right-aligned value (PDF token list). */
export function TokenRow({
  icon,
  name,
  ticker,
  value,
  sub,
}: {
  icon: ReactNode;
  name: string;
  ticker?: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center text-base"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-pill)",
          }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium">
          {name}
          {ticker && (
            <span className="ml-1.5" style={{ color: "var(--text-faint)" }}>
              {ticker}
            </span>
          )}
        </span>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm">{value}</p>
        {sub && (
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`bv-input px-3 py-2 text-sm ${props.className ?? ""}`}
    />
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bv-skeleton ${className}`} />;
}

/** Segmented pill control (PDF's 4H/1D/1W row). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="flex gap-1 p-1"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-pill)",
        width: "fit-content",
      }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="bv-press px-3 py-1 text-xs"
          style={{
            borderRadius: "var(--r-pill)",
            background: value === o.id ? "var(--cta)" : "transparent",
            color: value === o.id ? "var(--cta-text)" : "var(--text-dim)",
            fontWeight: value === o.id ? 600 : 400,
            transition: "background var(--t-fade) ease, color var(--t-fade) ease",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
