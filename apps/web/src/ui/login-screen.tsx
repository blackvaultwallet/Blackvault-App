"use client";

// Headless auth screen — Privy's modal never opens.
// Email OTP via useLoginWithEmail, Google via useLoginWithOAuth.
// The code step uses 6 digit boxes + an in-app numeric keypad (no device keyboard).

import { useEffect, useState } from "react";
import { useLoginWithEmail, useLoginWithOAuth } from "@privy-io/react-auth";
import { GoogleIcon } from "@/ui/icons";
import { NumPad } from "@/ui/num-pad";

const CODE_LEN = 6;
const RESEND_S = 30;

export function LoginScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const { initOAuth } = useLoginWithOAuth();

  const status = state.status;
  const sending = status === "sending-code";
  const awaitingCode =
    status === "awaiting-code-input" || status === "submitting-code";
  const submitting = status === "submitting-code";

  // resend countdown
  useEffect(() => {
    if (!awaitingCode || cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(c - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [awaitingCode, cooldown]);

  async function handleSendCode() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      await sendCode({ email: email.trim() });
      setCode("");
      setCooldown(RESEND_S);
    } catch {
      setError("Couldn't send the code. Try again.");
    }
  }

  async function handleVerify(value = code) {
    setError(null);
    if (value.length < CODE_LEN) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    try {
      await loginWithCode({ code: value });
    } catch {
      setError("Wrong or expired code. Try again.");
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await initOAuth({ provider: "google" });
    } catch {
      setError("Google sign-in failed. Try again.");
    }
  }

  function pressKey(k: string) {
    if (submitting) return;
    setError(null);
    if (k === "back") setCode((c) => c.slice(0, -1));
    else setCode((c) => (c.length < CODE_LEN ? c + k : c));
  }

  // physical keyboard still works on desktop
  useEffect(() => {
    if (!awaitingCode) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      else if (e.key === "Backspace") pressKey("back");
      else if (e.key === "Enter") handleVerify();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingCode, code, submitting]);

  return (
    <main className="bv-page-in relative flex min-h-screen flex-col items-center overflow-hidden px-6 pb-4 pt-6">
      <div aria-hidden className="bv-smoke pointer-events-none absolute inset-0" />

      {/* back */}
      <div className="bv-rise relative w-full max-w-sm">
        <button
          onClick={onBack}
          aria-label="Back"
          className="bv-press bv-btn-ghost flex h-10 w-10 items-center justify-center"
        >
          ←
        </button>
      </div>

      {!awaitingCode ? (
        /* ---------- email step ---------- */
        <div className="relative flex w-full max-w-sm flex-1 flex-col justify-center pb-10">
          <div className="text-center">
            <span
              className="bv-rise mx-auto flex h-12 w-12 items-center justify-center font-mono text-lg font-bold"
              style={{
                background: "var(--brand-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                border: "1px solid var(--brand-soft)",
                borderRadius: 14,
                animationDelay: "80ms",
              }}
            >
              V
            </span>
            <h1
              className="bv-rise mt-5 text-3xl font-semibold tracking-tight"
              style={{ animationDelay: "160ms" }}
            >
              Welcome back
            </h1>
            <p
              className="bv-rise mt-2 text-sm"
              style={{ color: "var(--text-dim)", animationDelay: "230ms" }}
            >
              Sign in to manage your vault.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
              placeholder="Enter your email address"
              autoComplete="email"
              disabled={sending}
              className="bv-input bv-rise h-12 px-4 text-sm"
              style={{ animationDelay: "300ms" }}
            />
            <button
              onClick={handleSendCode}
              disabled={sending}
              className="bv-press bv-btn-primary bv-rise h-12 w-full text-sm"
              style={{ animationDelay: "370ms" }}
            >
              {sending ? "Sending code…" : "Continue"}
            </button>

            <div
              className="bv-rise my-2 flex items-center gap-3"
              style={{ animationDelay: "430ms" }}
            >
              <span className="h-px flex-1" style={{ background: "var(--border)" }} />
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                or
              </span>
              <span className="h-px flex-1" style={{ background: "var(--border)" }} />
            </div>

            <button
              onClick={handleGoogle}
              className="bv-press bv-rise flex h-12 w-full items-center justify-center gap-2.5 text-sm font-medium"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-pill)",
                animationDelay: "490ms",
              }}
            >
              <GoogleIcon /> Continue with Google
            </button>
          </div>

          {error && (
            <p className="mt-4 text-center text-sm" style={{ color: "var(--negative)" }}>
              {error}
            </p>
          )}
        </div>
      ) : (
        /* ---------- verify step (reference style) ---------- */
        <div className="relative flex w-full max-w-sm flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span
              className="bv-rise flex h-12 w-12 items-center justify-center text-xl"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-pill)",
                animationDelay: "80ms",
              }}
            >
              ✉
            </span>
            <h1
              className="bv-rise mt-5 text-3xl font-semibold tracking-tight"
              style={{ animationDelay: "160ms" }}
            >
              Verify Email
            </h1>
            <p
              className="bv-rise mt-2 text-sm"
              style={{ color: "var(--text-dim)", animationDelay: "230ms" }}
            >
              We&apos;ve sent a 6-digit code to
              <br />
              <span style={{ color: "var(--text)" }}>{email}</span>
            </p>

            {/* digit boxes */}
            <div className="bv-rise mt-7 flex gap-2" style={{ animationDelay: "300ms" }}>
              {Array.from({ length: CODE_LEN }).map((_, i) => {
                const active = i === code.length;
                return (
                  <span
                    key={i}
                    className="flex h-13 w-11 items-center justify-center font-mono text-lg"
                    style={{
                      height: 52,
                      background: "var(--surface-2)",
                      border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                      borderRadius: "var(--r-control)",
                      transition: "border-color var(--t-fade) ease",
                    }}
                  >
                    {code[i] ?? (active ? <span className="animate-pulse">|</span> : "")}
                  </span>
                );
              })}
            </div>

            <p className="mt-4 text-xs" style={{ color: "var(--text-dim)" }}>
              {cooldown > 0 ? (
                <>Resend available in 00:{String(cooldown).padStart(2, "0")}</>
              ) : (
                <button
                  onClick={handleSendCode}
                  disabled={sending}
                  className="underline-offset-2 hover:underline"
                  style={{ color: "var(--brand)" }}
                >
                  {sending ? "Sending…" : "Resend code"}
                </button>
              )}
            </p>

            {error && (
              <p className="mt-3 text-sm" style={{ color: "var(--negative)" }}>
                {error}
              </p>
            )}
          </div>

          <button
            onClick={() => handleVerify()}
            disabled={submitting || code.length < CODE_LEN}
            className="bv-press bv-btn-primary bv-rise mb-4 h-12 w-full text-sm"
            style={{ animationDelay: "370ms" }}
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>

          {/* in-app keypad, slides up — device keyboard never opens */}
          <NumPad onKey={pressKey} />
        </div>
      )}
    </main>
  );
}
