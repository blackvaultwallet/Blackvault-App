"use client";

import { Drawer } from "vaul";

// Explicit consent step for outgoing transfers — drag-to-dismiss bottom sheet
// on mobile, centered on larger screens via vaul's built-in behavior.
// Doubles as the mainnet consent gate while embedded signing stays silent.
export function ConfirmSheet({
  open,
  title,
  rows,
  note,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  rows: [string, string][];
  note?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="p-6 pb-8">
            <div
              className="mx-auto mb-5 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
            <div className="mt-4 flex flex-col gap-2">
              {rows.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span style={{ color: "var(--text-dim)" }}>{k}</span>
                  <span className="break-all text-right font-mono">{v}</span>
                </div>
              ))}
            </div>
            {note && (
              <p className="mt-3 text-xs leading-5" style={{ color: "var(--text-dim)" }}>
                {note}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button
                onClick={onCancel}
                disabled={busy}
                className="bv-press bv-btn-ghost flex-1 py-2.5 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="bv-press bv-btn-primary flex-1 py-2.5 text-sm disabled:opacity-50"
              >
                {busy ? "…" : "Confirm"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
