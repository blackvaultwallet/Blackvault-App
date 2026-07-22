"use client";

// In-app numeric keypad (reference-style). Slides up from the bottom so the
// device keyboard never opens. "back" = backspace.

// `decimal` adds a "." key in the empty slot — for money amounts. Off by
// default so PIN/OTP keypads keep the blank.
export function NumPad({ onKey, decimal = false }: { onKey: (key: string) => void; decimal?: boolean }) {
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "", "0", "back"];
  return (
    <div
      className="bv-sheet-in grid w-full max-w-sm grid-cols-3 gap-1 pb-2"
      style={{ touchAction: "manipulation" }}
    >
      {KEYS.map((k, i) =>
        k === "" ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            onClick={() => onKey(k)}
            aria-label={k === "back" ? "Delete" : k}
            className="bv-press h-14 text-xl font-medium"
            style={{
              color: "var(--text)",
              borderRadius: "var(--r-control)",
              background: k === "0" ? "var(--surface-2)" : "transparent",
            }}
          >
            {k === "back" ? "⌫" : k}
          </button>
        )
      )}
    </div>
  );
}
