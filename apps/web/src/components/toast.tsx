"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(
  () => {}
);

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur",
              t.kind === "success"
                ? "border-accent/40 bg-background/95 text-foreground"
                : "border-red-500/40 bg-background/95 text-red-200",
            ].join(" ")}
          >
            {t.kind === "success" ? "✓ " : "✗ "}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
