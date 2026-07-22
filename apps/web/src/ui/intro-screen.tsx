"use client";

// Pre-login intro (app subdomain opens straight into this).
// 3 slides on a horizontal carousel, auto-advancing; animated card assets
// modeled on the reference video (floating stacked cards, drawing chart,
// drifting smoke background). Presentational only — auth comes in via props.

import { useEffect, useState } from "react";
import Image from "next/image";
import { EthIcon } from "@/ui/icons";
import { SlideToStart } from "@/ui/slide-to-start";

const SLIDE_MS = 3000;

/* ---------- slide 1: coin rows (reference screenshot) ---------- */

function CoinRow({
  icon,
  iconBg,
  name,
  value,
  valueDim,
  tint,
  delay,
  indent,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  value: string;
  valueDim: string;
  tint: string;
  delay: number;
  indent: number;
}) {
  return (
    <div
      className="bv-rise flex w-72 items-center justify-between px-4 py-3 text-sm"
      style={{
        marginLeft: indent,
        animationDelay: `${delay}ms`,
        background: `linear-gradient(90deg, ${tint}, rgba(18,17,16,0.92) 65%)`,
        border: "1px solid var(--border-strong)",
        borderRadius: 14,
        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
      }}
    >
      <span className="flex items-center gap-2 font-medium">
        <span
          className="flex h-7 w-7 items-center justify-center text-[12px] font-bold text-white"
          style={{ background: iconBg, borderRadius: "var(--r-pill)" }}
        >
          {icon}
        </span>
        {name}
      </span>
      <span className="font-mono">
        {value}
        <span style={{ color: "var(--text-faint)" }}>{valueDim}</span>
      </span>
    </div>
  );
}

function VisualShield() {
  return (
    <div className="relative flex h-72 w-full items-center justify-center sm:h-80">
      <div className="relative flex flex-col items-start gap-1.5">
        {/* BlackVault — gold */}
        <CoinRow
          icon={<span style={{ color: "var(--cta-text)" }}>V</span>}
          iconBg="var(--brand-gradient)"
          name="BlackVault"
          value="$•••••"
          valueDim=""
          tint="rgba(216, 180, 94, 0.45)"
          delay={0}
          indent={0}
        />
        {/* USDG — gold dollar chip */}
        <CoinRow
          icon={<span style={{ color: "var(--cta-text)", fontWeight: 800 }}>$</span>}
          iconBg="var(--brand-gradient)"
          name="USDG"
          value="$4,597"
          valueDim=".24"
          tint="rgba(216, 180, 94, 0.38)"
          delay={140}
          indent={14}
        />
        {/* Ethereum — official mark on dark chip */}
        <CoinRow
          icon={<EthIcon size={22} />}
          iconBg="#141414"
          name="Ethereum"
          value="$532"
          valueDim=".22"
          tint="rgba(98, 126, 234, 0.38)"
          delay={280}
          indent={28}
        />
      </div>
    </div>
  );
}

/* ---------- slide 2: private transfer path with marching dashes ---------- */

function VisualStealth() {
  return (
    <div className="relative flex h-72 w-full items-center justify-center sm:h-80">
      <div className="bv-card bv-float relative w-72 p-5">
        <div className="flex items-center justify-between">
          <span
            className="flex h-9 w-9 items-center justify-center font-mono text-sm"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
            }}
          >
            A
          </span>
          <svg width="110" height="20" viewBox="0 0 110 20" fill="none" aria-hidden>
            <line
              x1="2"
              y1="10"
              x2="96"
              y2="10"
              stroke="var(--brand)"
              strokeWidth="2"
              className="bv-dash"
            />
            <path d="M96 4 L108 10 L96 16 Z" fill="var(--brand)" />
          </svg>
          <span
            className="flex h-9 w-9 items-center justify-center font-mono text-sm"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-pill)",
            }}
          >
            B
          </span>
        </div>
        <div
          className="mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
          style={{ background: "var(--surface-2)" }}
        >
          <span style={{ color: "var(--text-dim)" }}>Amount</span>
          <span className="font-mono tracking-widest">•••••</span>
        </div>
        <p className="mt-2 text-center text-[10px]" style={{ color: "var(--text-dim)" }}>
          hidden on-chain
        </p>
      </div>
    </div>
  );
}

/* ---------- slide 3: 3D shield asset ---------- */

function VisualKeys() {
  return (
    <div className="relative flex h-72 w-full items-center justify-center sm:h-80">
      {/* rise and float animate transform — keep them on separate elements */}
      <div className="bv-rise">
        <Image
          src="/intro/shield-coin.png"
          alt=""
          width={300}
          height={300}
          priority
          className="bv-float select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}

const SLIDES = [
  {
    visual: <VisualShield />,
    title: "Your balance, invisible",
    desc: "Shield your assets. Amounts stay encrypted on-chain — visible only to you.",
  },
  {
    visual: <VisualStealth />,
    title: "Send without a trace",
    desc: "Private transfers hide the amount and break the link between sender and receiver.",
  },
  {
    visual: <VisualKeys />,
    title: "Your keys, your vault",
    desc: "Sign in with Google, secured by passkeys. Export your private key anytime — real self-custody.",
  },
];

export function IntroScreen({ onCreateWallet }: { onCreateWallet: () => void }) {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 pb-10 pt-8">
      {/* drifting smoke background, video-style */}
      <div aria-hidden className="bv-smoke pointer-events-none absolute inset-0" />

      {/* logo */}
      <div className="relative flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center font-mono text-sm font-bold"
          style={{
            background: "var(--brand-gradient)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            border: "1px solid var(--brand-soft)",
            borderRadius: 9,
          }}
        >
          V
        </span>
        <span className="text-sm font-semibold tracking-[0.25em]">BLACKVAULT</span>
      </div>

      {/* horizontal carousel */}
      <div className="relative flex w-full max-w-sm flex-1 flex-col items-center justify-center">
        <div className="w-full overflow-hidden">
          <div
            className="flex"
            style={{
              transform: `translateX(-${slide * 100}%)`,
              transition: "transform 550ms var(--ease-in-out)",
            }}
          >
            {SLIDES.map((s, i) => (
              <div key={s.title} className="w-full shrink-0 px-1 text-center">
                {/* remount on activation so entrance animations replay */}
                <div key={slide === i ? "active" : "idle"}>
                  {s.visual}
                  <h1
                    className="bv-rise mt-6 text-4xl font-bold leading-tight tracking-tight"
                    style={{ animationDelay: "120ms" }}
                  >
                    {s.title}
                  </h1>
                  <p
                    className="bv-rise mx-auto mt-3 max-w-xs text-sm leading-6"
                    style={{ color: "var(--text-dim)", animationDelay: "220ms" }}
                  >
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* dots */}
        <div className="mt-8 flex gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setSlide(i)}
              className="h-1.5 rounded-full"
              style={{
                width: i === slide ? 20 : 6,
                background: i === slide ? "var(--brand)" : "var(--border-strong)",
                transition:
                  "width var(--t-fade) var(--ease-out), background var(--t-fade) ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* actions */}
      <div className="relative flex w-full max-w-sm flex-col gap-3">
        <SlideToStart label="Get started" onComplete={onCreateWallet} />
      </div>
    </main>
  );
}
