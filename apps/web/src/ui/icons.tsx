// Official brand marks as inline SVG — crisp at any size, no network fetch.

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function SolanaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 398 312" aria-hidden>
      <defs>
        <linearGradient id="sol-g" x1="360" y1="-30" x2="20" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        fill="url(#sol-g)"
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7zM64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8zM333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
      />
    </svg>
  );
}

export function UsdtIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path
        fill="#fff"
        d="M17.9 17.4v-.002c-.11.008-.65.04-1.86.04-.97 0-1.65-.03-1.89-.04v.003c-3.74-.16-6.53-.81-6.53-1.59s2.79-1.43 6.53-1.6v2.54c.24.02.94.06 1.9.06 1.16 0 1.74-.05 1.85-.06v-2.54c3.73.17 6.51.82 6.51 1.6s-2.78 1.42-6.51 1.59zm0-3.45v-2.27h5.2V8.2H8.92v3.48h5.2v2.27c-4.23.2-7.4 1.03-7.4 2.03s3.18 1.84 7.4 2.03v7.28h3.77v-7.28c4.22-.2 7.39-1.03 7.39-2.03s-3.17-1.84-7.39-2.03z"
      />
    </svg>
  );
}

export function BtcIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        fill="#fff"
        d="M22.2 14.1c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.6-.4-.7 2.7c-.3-.1-.7-.2-1-.2l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1c0 .1.1 0 .2.1l-.2-.1-1.1 4.4c-.1.2-.3.5-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.1.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.4.1.9.2 1.3.3l-.7 2.7 1.6.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.1-3.2-1.5-4 1.1-.2 1.9-.9 2.1-2.4zm-3.8 5.2c-.5 2-3.9 1-5 .7l.9-3.6c1.1.3 4.6.8 4.1 2.9zm.5-5.3c-.5 1.9-3.3 1-4.2.7l.8-3.3c.9.3 3.9.7 3.4 2.6z"
      />
    </svg>
  );
}

export function EthIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path fill="#fff" fillOpacity="0.7" d="M16 5v8.1l6.9 3.1z" />
      <path fill="#fff" d="M16 5l-6.9 11.2L16 13.1z" />
      <path fill="#fff" fillOpacity="0.7" d="M16 21.6V27l6.9-9.5z" />
      <path fill="#fff" d="M16 27v-5.4l-6.9-4.1z" />
      <path fill="#fff" fillOpacity="0.45" d="M16 20.3l6.9-4.1L16 13.1z" />
      <path fill="#fff" fillOpacity="0.8" d="M9.1 16.2l6.9 4.1v-7.2z" />
    </svg>
  );
}

export function UsdcIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        fill="#fff"
        d="M20.4 18.6c0-2.1-1.3-2.9-3.8-3.2-1.8-.3-2.2-.7-2.2-1.5s.6-1.3 1.8-1.3c1.1 0 1.7.4 2 1.3.1.2.2.3.4.3h1c.2 0 .4-.2.4-.4v-.1c-.3-1.4-1.4-2.5-2.9-2.6v-1.5c0-.2-.2-.4-.4-.4h-.9c-.2 0-.4.2-.4.4v1.5c-1.8.2-3 1.4-3 2.9 0 2 1.2 2.8 3.7 3.1 1.7.3 2.3.6 2.3 1.6s-.8 1.5-2 1.5c-1.6 0-2.1-.7-2.3-1.6 0-.2-.2-.3-.4-.3h-1.1c-.2 0-.4.2-.4.4v.1c.3 1.5 1.3 2.6 3.2 2.9v1.5c0 .2.2.4.4.4h.9c.2 0 .4-.2.4-.4v-1.5c1.9-.3 3.3-1.6 3.3-3.1z"
      />
      <path
        fill="#fff"
        d="M12.9 24.5c-3.6-1.3-5.5-5.3-4.1-8.9.7-2 2.3-3.5 4.1-4.1.2-.1.3-.2.3-.5v-.9c0-.2-.1-.4-.3-.4h-.1c-4.4 1.4-6.8 6.1-5.4 10.5.8 2.6 2.8 4.6 5.4 5.4.2.1.4 0 .4-.2l.1-.1v-.9c0-.1-.2-.3-.4-.4zm6.3-14.8c-.2-.1-.4 0-.4.2l-.1.1v.9c0 .2.2.4.3.5 3.6 1.3 5.5 5.3 4.1 8.9-.7 2-2.3 3.5-4.1 4.1-.2.1-.3.2-.3.5v.9c0 .2.1.4.3.4h.1c4.4-1.4 6.8-6.1 5.4-10.5-.8-2.7-2.9-4.7-5.3-5.5z"
      />
    </svg>
  );
}

/** Robinhood Chain — the official feather asset (public/chains/rh.png). */
export function RhChainIcon({ size = 16 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/chains/rh.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 9999 }}
      aria-hidden
    />
  );
}

export function ArbitrumIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#213147" />
      <path fill="#12AAFF" d="M16 6l7.5 13-2.9 5-4.6-8-4.6 8-2.9-5z" />
      <path fill="#9DCCED" d="M16 13.4 19.2 19h-6.4z" />
    </svg>
  );
}

export function OptimismIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#FF0420" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="12"
        fontWeight="800"
        fontFamily="Arial, sans-serif"
      >
        OP
      </text>
    </svg>
  );
}

export function BaseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <path
        fill="#fff"
        d="M16 26c5.5 0 10-4.5 10-10S21.5 6 16 6C10.8 6 6.5 10 6 15h13.2v2H6c.5 5 4.8 9 10 9z"
      />
    </svg>
  );
}
