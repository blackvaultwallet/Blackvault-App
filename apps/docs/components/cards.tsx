// Wallet-style doc cards: thin gold gradient wash, stroke icons in a chip,
// mono titles, glow on hover. Used from MDX pages.

import Link from "next/link";
import type { ReactNode } from "react";

const svg = (d: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
);

/* stroke icon set (matches the wallet's inline icon style) */
export const Icons: Record<string, ReactNode> = {
  zap: svg(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />),
  mask: svg(
    <>
      <path d="M4 5l16 14" />
      <path d="M9.5 5.5A9.6 9.6 0 0 1 12 5c4 0 7.5 2 10 7a15 15 0 0 1-2.4 3.2M6.2 7.6C4.4 8.9 3 10.6 2 12c2.5 5 6 7 10 7 1.2 0 2.3-.2 3.4-.5" />
    </>
  ),
  tag: svg(
    <>
      <path d="M4 4h7l9 9-7 7-9-9z" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  shield: svg(<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />),
  qr: svg(
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3h-3zM20 17v3h-3" />
    </>
  ),
  lock: svg(
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  globe: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </>
  ),
  key: svg(
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8M16 16l2-2" />
    </>
  ),
  chart: svg(
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </>
  ),
};

export function BvCards({ children }: { children: ReactNode }) {
  return <div className="bv-cards">{children}</div>;
}

export function BvCard({
  icon,
  title,
  href,
  children,
}: {
  icon: keyof typeof Icons | string;
  title: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="bv-card">
      <span className="bv-card-head">
        <span className="bv-card-icon">{Icons[icon] ?? Icons.shield}</span>
        <span className="bv-card-title">{title}</span>
      </span>
      <span className="bv-card-desc">{children}</span>
    </Link>
  );
}
