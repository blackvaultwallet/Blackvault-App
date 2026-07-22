"use client";

// Private-vault banner. Renders the supplied "Shield & unshield balance"
// artwork from /public/banners. Drop the image at the path in `src` below.

import Image from "next/image";

export function ShieldBanner() {
  return (
    <div
      className="overflow-hidden"
      style={{ borderRadius: "var(--r-card)", border: "1px solid rgba(216,180,94,0.28)" }}
    >
      <Image
        src="/banners/shield-unshield.png"
        alt="Shield & unshield balance"
        width={2172}
        height={724}
        className="h-auto w-full"
        priority
      />
    </div>
  );
}
