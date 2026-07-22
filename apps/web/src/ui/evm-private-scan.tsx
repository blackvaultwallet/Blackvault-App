"use client";

// Scan a private address QR with the camera. Uses the browser's built-in
// BarcodeDetector where available (Chrome/Android); falls back to jsQR
// canvas decoding everywhere else (iOS Safari has no BarcodeDetector).

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Drawer } from "vaul";

type DetectedCode = { rawValue: string };
type DetectorLike = { detect(source: CanvasImageSource): Promise<DetectedCode[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

// jsQR path: sample the video into a small canvas (decode cost scales with
// pixels; ~400px is plenty for a phone-held QR).
const JSQR_MAX_DIM = 400;

export function EvmPrivateScan({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
        const canvas = detector ? null : document.createElement("canvas");
        const ctx = canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
        let lastDecode = 0;

        const tick = async () => {
          const v = videoRef.current;
          if (stopped || !v) return;
          try {
            if (detector) {
              const codes = await detector.detect(v);
              const hit = codes?.[0]?.rawValue;
              if (hit) {
                onResult(hit);
                return;
              }
            } else if (ctx && canvas && v.videoWidth > 0) {
              // Throttle canvas decoding — full-rate getImageData chugs on phones.
              const now = performance.now();
              if (now - lastDecode > 120) {
                lastDecode = now;
                const scale = Math.min(1, JSQR_MAX_DIM / v.videoWidth);
                canvas.width = Math.round(v.videoWidth * scale);
                canvas.height = Math.round(v.videoHeight * scale);
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(img.data, img.width, img.height);
                if (code?.data) {
                  onResult(code.data);
                  return;
                }
              }
            }
          } catch {
            /* frame not decodable — keep going */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Camera unavailable. Paste the address in Send instead.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onResult]);

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
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
          <div className="flex flex-col items-center p-6 pb-8">
            <div
              className="mb-5 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <h3 className="text-base font-semibold">Scan to pay</h3>

            {error ? (
              <p className="mt-4 text-center text-sm" style={{ color: "var(--text-dim)" }}>
                {error}
              </p>
            ) : (
              <div
                className="mt-4 w-full overflow-hidden"
                style={{ aspectRatio: "1 / 1", borderRadius: "var(--r-card)", background: "#000" }}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <p className="mt-4 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
              Point at a BlackVault payment QR or address
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
