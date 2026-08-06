"use client";

// Cards screen: your virtual cards, their live balance, and the card number
// behind an explicit tap.
//
// Everything here goes through /api/cards, which verifies the caller and checks
// they own the card before it forwards anything — the provider key never
// reaches the browser, and neither does anyone else's card.
//
// The provider rate-limits hard and blocks the shared key for minutes when
// tripped, so nothing here polls. Details and transactions load when asked for.

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";
import { useAuthedFetch } from "@/lib/authed-fetch";
import { parseUnits } from "viem";
import { useEvmWallet } from "@/lib/chain/evm/wallet";
import { ACTIVE_EVM_CHAIN } from "@/lib/chain/evm/config";
import {
  FUNDING_SUPPORTED,
  SOLANA_CHAIN_ID,
  SOLANA_USDT,
  USDT_DECIMALS,
  executeFunding,
  getPayoutQuote,
} from "@/lib/chain/evm/funding";
import {
  DEPOSIT_FEE_RATE,
  FUNDING_RATE,
  ISSUANCE_FEE,
  MIN_FUNDABLE,
  MIN_OPENABLE,
  PROCESSING_FEE,
  depositToFund,
  depositToOpen,
} from "@/lib/cards/pricing";
import { useToast } from "@/components/toast";
import { coinIcon } from "@/ui/evm-coins";
import { BaseIcon, EthIcon, OptimismIcon, RhChainIcon } from "@/ui/icons";
import { Button, Skeleton } from "@/ui/primitives";

interface CardRow {
  cardId: string;
  last4: string;
  bin: string;
  createdAt: number;
  holder?: string;
  tierId?: string;
  /** Preview only — never sent to the provider, never holds real money. */
  demo?: boolean;
  demoBalance?: number;
}

interface Details {
  card_number: string;
  expiry: string;
  cvv: string;
  balance: number;
  status: string;
}

interface Txn {
  date: string;
  type: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
}

// 441357 — Visa, United States. Taken from their dashboard rather than the API
// docs, which list five other BINs and not this one; the dashboard is the live
// list and the docs are behind.
//
// It is the most capable one they offer: Apple Pay, Google Pay and Samsung Pay,
// 3DS with an independent PIN, $150,000 annual limit, unlimited top-ups. A US
// Visa also clears the widest set of merchants, which is the whole reason to
// care which BIN a card is on.
//
// One caveat their dashboard prints in passing: cards on this BIN are subject
// to manual approval, so issuance is not necessarily instant.
const BIN = "441357";

/**
 * Their fees at creation. Top-ups skip the issuance fee — see fundcard.
 *
 * The $5 is labelled as burned in the UI. Be clear what that means: the
 * provider charges it and keeps it, so burning is something we do separately
 * and out of our own pocket. If that ever stops happening the label is a lie,
 * and it is the first thing that has to change.
 */
// Rates and helpers live in lib/cards/pricing — the screen quotes them and the
// route enforces them, and the two disagreeing is how someone pays one number
// and is charged another.

// The floors live in lib/cards/pricing — the card's own ($10 to open, $1 after)
// and the deposit rail's, which sits above both and is the one that decides
// what this screen can offer.

/**
 * A payment made but not yet turned into a card.
 *
 * Kept in localStorage from before the first token moves until the card
 * exists. The deposit id is the only handle on money already credited to the
 * provider — without it a closed tab, a dead battery or a failed issue leaves
 * the payment stranded in an account the user has no way to reach.
 */
interface PendingOpen {
  depositId: string;
  amount: number;
  nameOnCard: string;
  tierId: string;
}

const openKey = (owner: string) => `bv_card_open_${owner.toLowerCase()}`;

function rememberOpen(owner: string, open: PendingOpen): void {
  try {
    window.localStorage.setItem(openKey(owner), JSON.stringify(open));
  } catch {
    // Private mode, or storage full. The flow still works in this tab; only
    // recovery after a reload is lost, so don't fail the payment over it.
  }
}

function readOpen(owner: string): PendingOpen | null {
  try {
    const raw = window.localStorage.getItem(openKey(owner));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<PendingOpen>;
    return typeof o.depositId === "string" && typeof o.amount === "number"
      ? { depositId: o.depositId, amount: o.amount, nameOnCard: o.nameOnCard ?? "", tierId: o.tierId ?? "standard" }
      : null;
  } catch {
    return null;
  }
}

function forgetOpen(owner: string): void {
  try {
    window.localStorage.removeItem(openKey(owner));
  } catch {
    /* nothing to do — a stale entry only costs one extra offer to resume */
  }
}

/** Quick picks for the opening balance. The floor is first so the cheapest
 *  option is the default one your thumb lands on. */
const OPEN_PRESETS = [10, 15, 20, 50, 100];

/** Worth knowing when reading these: the fee is a flat $1 plus 4%, so a $5
 *  top-up costs $1.20 — a quarter of it again. The small ones are here because
 *  people ask for them, not because they are good value. */
const TOPUP_PRESETS = [5, 10, 20, 50, 100, 250];

const glass: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "var(--r-card)",
};

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent px-4 py-3 text-sm outline-none"
        style={glass}
      />
    </label>
  );
}

/**
 * Card tiers.
 *
 * These are ours, not the provider's — it sells one product on one BIN. The
 * limits, cashback and fee waivers below are a product decision layered on top,
 * so anything promised here has to be honoured by us. Two that actually cost
 * money if a user takes them at their word: Platinum's 0% fees (the provider
 * still charges 1% on deposit and $1 + 4% on funding, so we absorb it), and
 * cashback, which nothing pays out yet.
 */
interface Tier {
  id: string;
  name: string;
  art: string;
  limit: string;
  minDeposit: number;
  perks: string[];
  /** Not openable yet — shown, but not selectable. */
  soon?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "standard",
    name: "Standard",
    art: "/cards/tier-standard-v2.png",
    limit: "$10,000",
    minDeposit: 10,
    perks: ["Free to open", "Low fees"],
  },
  {
    id: "gold",
    name: "Gold",
    art: "/cards/tier-gold-v2.png",
    limit: "$50,000",
    minDeposit: 25,
    perks: ["Free to open", "Cashback up to 5% per transaction", "Low fees"],
  },
  {
    id: "platinum",
    name: "Platinum",
    art: "/cards/tier-platinum.png",
    limit: "$100,000",
    minDeposit: 100,
    soon: true,
    perks: [
      "Cashback up to 10% per transaction",
      "VIP customer service",
      "0% deposit and transaction fees",
    ],
  },
];

/* ---------- preview data ---------- */

/** Obviously-fake numbers: 4242 is the universal test card, and 0000 is not a
 *  CVV anyone could mistake for real. */
function demoDetails(row: CardRow, status: string): Details {
  return {
    card_number: `${row.bin}42424242${row.last4}`.slice(0, 16),
    expiry: "12/29",
    cvv: "000",
    balance: row.demoBalance ?? 0,
    status,
  };
}

/**
 * Transactions and balance, kept for the session.
 *
 * Their rate limit is brutal — a handful of calls blocks the shared key for
 * seven minutes, for every user at once — and this component remounts every
 * time the deck is swiped. Without a cache, flicking through three cards and
 * back costs six calls and locks everyone out.
 */
const cardCache = new Map<string, { txns: Txn[]; balance: number | null }>();

const DEMO_TXNS: Txn[] = [
  { date: "2026-08-03 14:02", type: "Authorize", merchant: "Namecheap", amount: 12.88, currency: "USD", status: "success" },
  { date: "2026-08-02 09:41", type: "Authorize", merchant: "OpenAI", amount: 20.0, currency: "USD", status: "success" },
  { date: "2026-08-01 18:20", type: "Refund", merchant: "Spotify", amount: 9.99, currency: "USD", status: "pending" },
  { date: "2026-07-30 11:07", type: "Authorize", merchant: "Vercel", amount: 20.0, currency: "USD", status: "success" },
];

/** The interlocking circles, drawn rather than shipped as an asset. */
function MastercardMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 36 22" aria-hidden>
      <circle cx="13" cy="11" r="11" fill="#EB001B" />
      <circle cx="23" cy="11" r="11" fill="#F79E1B" />
      <path
        d="M18 2.6a11 11 0 0 0 0 16.8 11 11 0 0 0 0-16.8z"
        fill="#FF5F00"
      />
    </svg>
  );
}

/** Gold disc for USDG — it has no brand mark of its own in the icon set. */
function UsdgDisc({ size = 26 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--brand-gradient)",
        color: "var(--cta-text)",
        fontSize: size * 0.5,
      }}
    >
      $
    </span>
  );
}

/** The feather ships as a bare image, so it needs its own disc here. */
function RhDisc({ size = 26 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: "50%", background: "#ccff00" }}
    >
      <RhChainIcon size={size} />
    </span>
  );
}

/** Overlapping chain marks — deposits arrive from any of these, not just RH. */
function ChainStack() {
  const marks = [
    <RhDisc key="rh" />,
    <EthIcon key="eth" size={26} />,
    <UsdgDisc key="usdg" />,
    <BaseIcon key="base" size={26} />,
    <OptimismIcon key="op" size={26} />,
  ];
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex">
        {marks.map((m, i) => (
          <span
            key={i}
            className="flex overflow-hidden rounded-full"
            style={{
              marginLeft: i ? -8 : 0,
              // Ring in the page colour so the discs read as stacked rather
              // than as one blurred strip.
              boxShadow: "0 0 0 2px var(--surface-solid)",
              zIndex: marks.length - i,
            }}
          >
            {m}
          </span>
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--text-faint)" }}>
        Deposit from any chain
      </span>
    </div>
  );
}

/**
 * Cover shown until the first card exists.
 *
 * Fills its scroll container rather than claiming a viewport fraction — the
 * parent is a flex-1 pane with a definite height, so `h-full` lands exactly and
 * leaves no dead space under the button.
 *
 * The artwork is object-cover, not contain: it's a 1080x1920 portrait, and
 * contain in a phone-width box shrinks it to a stamp floating in the middle.
 * Cover fills the width and crops vertically, focused at 40% so the card and
 * her face stay in frame while the empty top of the asset falls away.
 */
function Cover({
  onOpen,
  onBack,
  error,
  onRetry,
  pending,
  onResume,
  busy,
  stage,
}: {
  onOpen: () => void;
  onBack?: () => void;
  /** Why the card list is missing, if it is missing for a reason. */
  error?: string | null;
  onRetry?: () => void;
  /** A payment already made, still owed a card. */
  pending?: PendingOpen | null;
  onResume?: () => void;
  busy?: boolean;
  stage?: string | null;
}) {
  return (
    // Natural height, centred by the parent. It used to be h-full with the
    // artwork pushed down by mt-auto, which on a tall desktop pane opened a
    // canyon of empty black between the copy and the photo.
    // One column on a phone (copy, photo, button), two from md — a 448px strip
    // centred in a 2500px monitor reads as a mistake, not as restraint.
    <div className="relative grid w-full md:grid-cols-2 md:items-center md:gap-14">
      <div className="relative z-10 flex flex-col gap-3 pt-1 md:col-start-1 md:row-start-1">
        {/* Claims what is actually true — that it opens without identity — and
            stops there. The card runs on Visa rails, so the issuer sees every
            purchase; saying otherwise would trade the one thing this product
            has, which is being believed about privacy. */}
        <h2 className="text-[30px] font-semibold leading-[1.05] tracking-tight md:text-[52px]">
          The first card
          <br />
          that never asks
          <br />
          your name.
        </h2>
        <p
          className="max-w-[20rem] text-sm leading-6 md:max-w-[26rem] md:text-base md:leading-7"
          style={{ color: "var(--text-dim)" }}
        >
          No bank. No documents. No application. Opened straight from your vault in
          seconds, and spendable at 130 million merchants.
        </p>
        <ChainStack />
      </div>

      {/* The card art is 1:1 on transparent black, so it just sits in a square
          and floats — no crop, no mask, nothing to fight. Gold pooled behind it
          reads as light catching the gold edge. */}
      <div className="relative z-[1] mt-8 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:self-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(48% 40% at 50% 50%, rgba(216,180,94,0.32), rgba(216,180,94,0.06) 56%, transparent 74%)",
          }}
        />
        <div className="relative z-[1] mx-auto aspect-square w-full max-w-[21rem] md:max-w-[30rem]">
          <Image
            src="/cards/card-cover.png"
            alt="BlackVault Standard, Gold and Platinum cards"
            fill
            priority
            sizes="(max-width: 768px) 86vw, 30rem"
            className="bv-float"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>

      {/* Pinned to the bottom on a phone like the nav bar, so it stays reachable
          whatever the artwork does above it. Back in flow from md, where the
          copy column has room for it. */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-6 pb-5 pt-8 md:static md:col-start-1 md:row-start-2 md:mt-8 md:px-0 md:pb-0 md:pt-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[1] md:hidden"
          style={{
            background: "linear-gradient(to top, var(--surface-solid) 55%, transparent)",
          }}
        />
        <div className="mx-auto w-full max-w-md md:max-w-none">
          {/* Ahead of everything else on the screen. Someone whose payment went
              through and whose card didn't should not have to read a pitch. */}
          {pending && (
            <div
              className="mb-3 flex flex-col gap-2 p-3"
              style={{ ...glass, background: "rgba(216,180,94,0.08)" }}
            >
              <p className="text-[12px] leading-5">
                <strong>You&apos;ve already paid for a card.</strong> It was taken
                from your wallet but the card was never issued — nothing is lost.
              </p>
              <button
                onClick={onResume}
                disabled={busy}
                className="bv-press h-10 text-xs font-medium"
                style={{
                  background: "var(--brand-soft)",
                  border: "1px solid rgba(216,180,94,0.4)",
                  borderRadius: "var(--r-card)",
                  color: "var(--brand)",
                }}
              >
                {busy ? "Working…" : "Finish opening it"}
              </button>
              {stage && (
                <p className="text-center text-[11px]" style={{ color: "var(--brand)" }}>
                  {stage}
                </p>
              )}
            </div>
          )}
          <Button onClick={onOpen} className="h-12 w-full md:max-w-xs">
            Open Card
          </Button>
          {/* Only once there is a deck behind this — on a first run there is
              nothing to go to, and an empty destination is worse than no link. */}
          {onBack && (
            <button
              onClick={onBack}
              className="bv-press mt-2 h-10 w-full text-xs md:max-w-xs"
              style={{ color: "var(--text-dim)" }}
            >
              My cards
            </button>
          )}
          {/* A card that exists but failed to load looks exactly like no card at
              all, and silence here reads as "you own nothing" — the one thing we
              must never say wrongly about someone's money. */}
          {!onBack && error && (
            <div className="mt-2 flex flex-col items-center gap-1 md:items-start">
              <span className="text-[11px]" style={{ color: "var(--danger, #f87171)" }}>
                Couldn&apos;t load your cards — {error}
              </span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="bv-press h-8 text-xs underline"
                  style={{ color: "var(--text-dim)" }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {/* Visa is what we issue on today; Mastercard arrives with Platinum.
              Marks drawn inline rather than shipped as art — a wrong logo is
              worse than a word, and these are the two everyone knows by shape. */}
          <div className="mt-3 flex items-center justify-center gap-2.5 md:justify-start">
            <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Supported by
            </span>
            <span className="text-[12px] font-bold italic tracking-tight">VISA</span>
            <MastercardMark />
            <span className="text-[11px] font-medium">Mastercard</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stacked, swipeable deck — same idea as the portfolio deck on Home. The last
 * slot is always Create card, so adding one is part of flipping through them
 * rather than a button parked underneath.
 */
function CardDeck({
  cards,
  active,
  onActive,
  onCreate,
}: {
  cards: CardRow[];
  active: number;
  onActive: (i: number) => void;
  onCreate: () => void;
}) {
  const total = cards.length + 1; // + the create slot
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, active: false, decided: false, vertical: false });

  function down(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, active: true, decided: false, vertical: false };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    const deltaY = e.clientY - d.y;
    const deltaX = Math.abs(e.clientX - d.x);
    if (!d.decided) {
      if (Math.abs(deltaY) < 8 && deltaX < 8) return;
      d.decided = true;
      d.vertical = Math.abs(deltaY) > deltaX;
      if (d.vertical) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    // Up rolls the deck forward; down only rubber-bands, since there is
    // nothing in front of the first card to pull back.
    if (d.vertical) setDy(deltaY < 0 ? deltaY : deltaY * 0.25);
  }
  function up() {
    const d = drag.current;
    d.active = false;
    setDragging(false);
    if (d.vertical && Math.abs(dy) > 60) {
      const next = dy < 0 ? active + 1 : active - 1;
      onActive(Math.max(0, Math.min(total - 1, next)));
    }
    setDy(0);
  }

  return (
    <div className="flex flex-col">
      <div
        className="relative select-none"
        style={{ touchAction: "pan-x" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {/* Reserves the height, plus room for the two cards peeking below. */}
        <div className="invisible aspect-[1.59/1] w-full" />
        <div className="h-7" />

        {Array.from({ length: total }, (_, i) => {
          const offset = i - active;
          if (offset < 0 || offset > 2) return null; // only the front three matter
          const isCreate = i === cards.length;
          const drift = offset === 0 && dragging ? dy : 0;
          return (
            <div
              key={isCreate ? "create" : cards[i]!.cardId}
              className="absolute inset-x-0 top-0"
              style={{
                transform: `translateY(${drift + offset * 14}px) scale(${1 - offset * 0.05})`,
                opacity: offset > 1 ? 0.6 : 1,
                zIndex: total - offset,
                transition: dragging ? "none" : "transform 280ms var(--ease-out), opacity 280ms",
                pointerEvents: offset === 0 ? "auto" : "none",
              }}
            >
              {isCreate ? (
                <button
                  onClick={onCreate}
                  className="bv-press flex aspect-[1.59/1] w-full flex-col items-center justify-center gap-3"
                  style={{ ...glass, borderRadius: "1rem", borderStyle: "dashed" }}
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center"
                    style={{
                      borderRadius: "50%",
                      background: "var(--brand-gradient)",
                      color: "var(--cta-text)",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">Create card</span>
                </button>
              ) : (
                <CardFace row={cards[i]!} />
              )}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          Swipe the card up to switch
        </p>
      )}
    </div>
  );
}

/** Just the art. Everything interactive lives under the deck. */
function CardFace({ row }: { row: CardRow }) {
  const tier = TIERS.find((t) => t.id === row.tierId) ?? TIERS[0]!;
  return (
    <div className="relative aspect-[1.59/1] w-full overflow-hidden rounded-2xl">
      <Image
        src={tier.art}
        alt={`BlackVault ${tier.name} card`}
        fill
        sizes="(max-width: 768px) 90vw, 24rem"
        style={{ objectFit: "cover" }}
        draggable={false}
      />
      {/* Just the holder, bottom-left, on the baseline the network mark sits on
          in the art. The number lives behind Details — embossing it here would
          put a live card number on screen whenever the app is open. */}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex justify-end">
          {row.demo && (
            <span
              className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "rgba(0,0,0,0.55)", borderRadius: "var(--r-pill)", color: "#fff" }}
            >
              Preview
            </span>
          )}
        </div>
        {!!row.holder && (
          <span
            className="truncate text-[13px] font-medium uppercase tracking-wide"
            style={{ color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}
          >
            {row.holder}
          </span>
        )}
      </div>
    </div>
  );
}

/** Empty state after Open Card: one target, nothing else to read. */
function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <button
        onClick={onStart}
        aria-label="Create card"
        className="bv-press flex h-20 w-20 items-center justify-center"
        style={{
          borderRadius: "50%",
          background: "var(--brand-gradient)",
          color: "var(--cta-text)",
          boxShadow: "0 12px 34px rgba(216,180,94,0.28)",
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-sm font-medium">Create card</span>
      <span className="text-xs" style={{ color: "var(--text-faint)" }}>
        You don&apos;t have a card yet
      </span>
    </div>
  );
}

/** Tier picker — the art is the product, so it leads and the specs follow. */
function TierPicker({
  onPick,
  onBack,
}: {
  onPick: (t: Tier) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Choose your card</h3>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          You can open another tier later — one card per design.
        </p>
      </div>

      {TIERS.map((t) => (
        <button
          key={t.id}
          onClick={() => !t.soon && onPick(t)}
          disabled={t.soon}
          className="bv-press flex flex-col gap-3 p-3 text-left disabled:cursor-default"
          style={glass}
        >
          {/* 2000x1256 is near enough the real card ratio to use as-is. */}
          <div className="relative aspect-[1.59/1] w-full overflow-hidden rounded-xl">
            <Image
              src={t.art}
              alt={`BlackVault ${t.name} card`}
              fill
              sizes="(max-width: 768px) 90vw, 24rem"
              style={{ objectFit: "cover", filter: t.soon ? "grayscale(0.4)" : undefined }}
            />
            {t.soon && (
              <div className="absolute inset-0 flex items-center justify-center gap-2" style={{ background: "rgba(0,0,0,0.55)" }}>
                <LockIcon />
                <span className="text-xs font-semibold uppercase tracking-wide">Soon</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-3 px-1">
            <span className="text-sm font-semibold">{t.name}</span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              Limit {t.limit}
            </span>
          </div>

          <ul className="flex flex-col gap-1.5 px-1 pb-1">
            {!t.soon && (
              <li className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                {/* What this tier can actually be opened with — the tier's own
                    figure would advertise a card the rail won't sell. */}
                <Tick /> Min deposit ${Math.max(MIN_OPENABLE, t.minDeposit)}
              </li>
            )}
            {t.perks.map((p) => (
              <li key={p} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                <Tick /> {p}
              </li>
            ))}
          </ul>
        </button>
      ))}

      <CardSpecs />
      <Platforms />

      <button onClick={onBack} className="bv-press bv-btn-ghost h-11 w-full text-sm">
        Back
      </button>
    </div>
  );
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3c.5 3-2 4-2 6.5A2.5 2.5 0 0 0 12 12a2.5 2.5 0 0 0 2-2.5C14 7 12 6 12 3z" />
      <path d="M7.5 10C6 12 5 13.7 5 15.5a7 7 0 0 0 14 0c0-1.8-1-3.5-2.5-5.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * What the card actually is, from their dashboard for BIN 441357. Same for
 * every tier — the tiers are our layer, this is the card underneath.
 */
function CardSpecs() {
  const rows: [React.ReactNode, string, string][] = [
    [<SpecIcon.Clock key="c" />, "Validity", "3 years"],
    [<SpecIcon.Shield key="s" />, "Security", "3DS + independent PIN"],
    [<SpecIcon.Chart key="l" />, "Annual limit", "$150,000"],
    [<SpecIcon.Refresh key="t" />, "Top-ups", "Unlimited"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map(([icon, k, v]) => (
        <div key={k} className="flex flex-col gap-1.5 p-3" style={glass}>
          <span
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            <span style={{ color: "var(--brand)" }}>{icon}</span>
            {k}
          </span>
          <span className="text-xs font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

const SpecIcon = {
  Clock: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Shield: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z" />
      <path d="M9 12.5l2 2 4-4.5" />
    </svg>
  ),
  Chart: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  Refresh: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 13a8 8 0 0 0 14 4.5L20 15" />
      <path d="M4 5v4h4M20 19v-4h-4" />
    </svg>
  ),
};

/** Where it's accepted. Named platforms rather than "works everywhere". */
const PLATFORMS = [
  "Apple Pay",
  "Google Pay",
  "Samsung Pay",
  "Facebook",
  "TikTok",
  "Google Ads",
  "Amazon",
  "OpenAI",
  "Shopify",
  "Starlink",
  "AliExpress",
  "Namecheap",
];

function Platforms() {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Works with
      </span>
      <div className="flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => (
          <span
            key={p}
            className="px-2.5 py-1 text-[11px]"
            style={{ ...glass, borderRadius: "var(--r-pill)", color: "var(--text-dim)" }}
          >
            {p}
          </span>
        ))}
        <span className="px-2.5 py-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
          +40 more
        </span>
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="var(--brand)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bottom sheet, same shape as the send and payment-request ones. */
function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md outline-none"
          style={{
            background:
              "radial-gradient(120% 70% at 50% 0%, rgba(216,180,94,0.30), rgba(216,180,94,0.06) 45%, transparent 70%), var(--surface-solid)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            borderRadius: "var(--r-card) var(--r-card) 0 0",
          }}
        >
          <div className="flex flex-col items-center p-5 pb-7">
            <div
              className="mb-4 h-1 w-10"
              style={{ background: "var(--border-strong)", borderRadius: "var(--r-pill)" }}
            />
            <Drawer.Title className="self-start text-base font-semibold">{title}</Drawer.Title>
            <div className="mt-4 flex w-full flex-col gap-3">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function FeeRow({
  label,
  value,
  struck,
}: {
  label: string;
  value: string;
  struck?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span className={`font-mono tabular-nums${struck ? " line-through opacity-50" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
    </svg>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bv-press flex flex-1 flex-col items-center gap-1.5 py-3 text-[11px] disabled:opacity-40"
      style={glass}
    >
      <span style={{ color: danger ? "var(--negative)" : "var(--brand)" }}>{icon}</span>
      {label}
    </button>
  );
}

const I = {
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  snow: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M12 2v20M4 6l16 12M20 6L4 18" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  trash: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  ),
};

/**
 * One card: the art, its balance, and the actions on it.
 *
 * A preview card (`row.demo`) never touches the API — it exists so the screen
 * can be judged before anyone spends money on a real one, and every number on
 * it is invented. It is labelled as such on the face; a fake card that looked
 * real would be worse than no preview at all.
 */
function CardItem({
  row,
  onDelete,
}: {
  row: CardRow;
  onDelete?: (cardId: string) => void;
}) {
  const api = useAuthedFetch();
  const toast = useToast();
  const [details, setDetails] = useState<Details | null>(null);
  // A preview card's history is known up front, so it seeds the state rather
  // than being set from inside an effect.
  const [txns, setTxns] = useState<Txn[] | null>(
    row.demo ? DEMO_TXNS : (cardCache.get(row.cardId)?.txns ?? null)
  );
  // The transactions response carries the balance, so the headline figure costs
  // no extra call — it used to sit at "—" until someone opened Details.
  const [balance, setBalance] = useState<number | null>(
    row.demo ? row.demoBalance ?? 0 : (cardCache.get(row.cardId)?.balance ?? null)
  );
  const [depositing, setDepositing] = useState(false);
  const [depAmount, setDepAmount] = useState("");
  // USDG first: the amount is exact, and Relay routes it a shade cheaper than
  // ETH. Paying in ETH means the figure moves between quote and signature, and
  // the provider's deposit address expires in about half an hour.
  const [payAsset, setPayAsset] = useState<"USDG" | "ETH">("USDG");
  const [depStage, setDepStage] = useState<string | null>(null);
  const { walletClient, address } = useEvmWallet();

  /**
   * Open a deposit intent, bridge to the address it hands back, then tell the
   * server to apply it.
   *
   * Exact-output on the quote: the provider expects that figure and keeps the
   * difference otherwise — we have already had one land `paid_over` with the
   * excess uncredited. The server re-checks with the provider before funding
   * anything, so a bridge that half-finishes cannot conjure a balance.
   */
  async function deposit() {
    if (!walletClient || !address) return toast("error", "Connect your wallet first");
    setBusy("deposit");
    try {
      setDepStage("Opening a deposit…");
      const { deposit: d } = await api<{ deposit: { id: string; pay_address: string; pay_amount: string } }>(
        "/api/cards",
        // The amount to land on the card — the server prices the deposit that
        // pays for it, fees and their inbound cut included.
        { action: "deposit", fundAmount: depNum, forCardId: row.cardId }
      );

      setDepStage("Pricing the route…");
      const quote = await getPayoutQuote({
        user: address,
        from: payAsset,
        amount: parseUnits(d.pay_amount, USDT_DECIMALS),
        exactOutput: true,
        to: { chainId: SOLANA_CHAIN_ID, currency: SOLANA_USDT, recipient: d.pay_address },
      });

      setDepStage(`Confirm ${quote.inFormatted} ${quote.inSymbol} in your wallet…`);
      await executeFunding(quote, ACTIVE_EVM_CHAIN, walletClient, (s) => setDepStage(s));

      setDepStage("Crediting the card…");
      await api("/api/cards", { action: "apply-deposit", depositId: d.id });

      cardCache.delete(row.cardId);
      toast("success", "Funds added");
      setDepositing(false);
      setDepAmount("");
    } catch (e) {
      // The bridge may well have gone through — the webhook applies it either
      // way, so this must not read as "your money is gone".
      toast("error", (e as Error).message);
    } finally {
      setDepStage(null);
      setBusy(null);
    }
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("error", "Couldn't reach the clipboard");
    }
  }

  const tier = TIERS.find((t) => t.id === row.tierId) ?? TIERS[0]!;
  const frozen = details?.status?.toLowerCase() === "frozen";

  const run = useCallback(
    async (action: string, then: (r: unknown) => void) => {
      setBusy(action);
      try {
        then(await api("/api/cards", { action, cardId: row.cardId }));
      } catch (e) {
        toast("error", (e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [api, row.cardId, toast]
  );

  function showDetails() {
    if (row.demo) return setDetails(demoDetails(row, frozen ? "frozen" : "active"));
    void run("details", (r) => setDetails(r as Details));
  }

  function showTxns() {
    if (row.demo) return setTxns(DEMO_TXNS);
    const hit = cardCache.get(row.cardId);
    if (hit) return setTxns(hit.txns);
    void run("transactions", (r) => {
      const d = (r as { data?: { transactions?: Txn[]; balance?: number } }).data;
      const t = d?.transactions ?? [];
      cardCache.set(row.cardId, {
        txns: t,
        balance: typeof d?.balance === "number" ? d.balance : null,
      });
      setTxns(t);
    });
  }

  function toggleFreeze() {
    const next = frozen ? "active" : "frozen";
    if (row.demo) return setDetails((d) => (d ? { ...d, status: next } : demoDetails(row, next)));
    void run(frozen ? "unfreeze" : "freeze", () =>
      setDetails((d) => (d ? { ...d, status: next } : d))
    );
  }

  // Top-ups carry the funding and processing fees but not issuance — that one
  // is charged once, when the card is opened. Nothing is owed until an amount
  // is typed: the processing fee used to show through on an empty field, which
  // read as a charge for doing nothing.
  // The floor is the payment rail's, not the card's: the provider takes $1
  // top-ups but won't take a deposit small enough to pay for one.
  const depNum = Number(depAmount);
  const depValid = Number.isFinite(depNum) && depNum >= MIN_FUNDABLE;
  const depFunding = depValid ? depNum * FUNDING_RATE : 0;
  const depFee = !depValid || tier.id === "platinum" ? 0 : depFunding + PROCESSING_FEE;
  // What actually leaves the wallet, so the card receives the figure typed.
  const depTotal = depValid ? depositToFund(depNum) : 0;

  // The history is the content of this screen, so it loads on view rather than
  // waiting behind a tap. One call per card, guarded so re-renders don't repeat
  // it — their rate limit blocks the shared key for minutes when tripped.
  // Ref, not the `txns` state: state hasn't updated yet when StrictMode runs the
  // effect a second time, so a state guard fires two requests. No cancellation
  // flag either — the cleanup would kill the only request the guard allows.
  const fetchedTxns = useRef(false);
  useEffect(() => {
    if (fetchedTxns.current || row.demo || cardCache.has(row.cardId)) return;
    fetchedTxns.current = true;
    api<{ data?: { transactions?: Txn[]; balance?: number } }>("/api/cards", {
      action: "transactions",
      cardId: row.cardId,
    })
      .then((r) => {
        const t = r.data?.transactions ?? [];
        const b = typeof r.data?.balance === "number" ? r.data.balance : null;
        cardCache.set(row.cardId, { txns: t, balance: b });
        setTxns(t);
        if (b !== null) setBalance(b);
      })
      .catch(() => setTxns([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.cardId]);

  // Spent this month, from the history we already have. Refunds come back off.
  const month = new Date().toISOString().slice(0, 7);
  const spent = (txns ?? [])
    .filter((t) => t.date.startsWith(month))
    .reduce((n, t) => n + (t.type === "Refund" ? -t.amount : t.amount), 0);
  const limitNum = Number(tier.limit.replace(/[^0-9]/g, ""));
  const pct = limitNum ? Math.min(100, (Math.max(0, spent) / limitNum) * 100) : 0;

  async function closeCard() {
    if (row.demo) {
      setClosing(false);
      onDelete?.(row.cardId);
      return;
    }
    setBusy("delete");
    try {
      const r = await api<{ refunded?: number }>("/api/cards", {
        action: "delete",
        cardId: row.cardId,
      });
      toast("success", `Card closed — ${usd(r.refunded ?? 0)} returned`);
      setClosing(false);
      onDelete?.(row.cardId);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The holder is embossed on the art above, so this line labels the
          figure next to it instead of repeating the name. */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">Active balance</span>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            {tier.name} · Limit {tier.limit}
            {frozen ? " · Frozen" : ""}
          </span>
        </div>
        <span className="font-mono text-2xl tabular-nums">
          {details ? usd(details.balance) : balance !== null ? usd(balance) : "—"}
        </span>
      </div>

      <div className="flex gap-2">
        <ActionButton label="Deposit" icon={I.plus} onClick={() => setDepositing(true)} />
        <ActionButton
          label="Details"
          icon={I.eye}
          onClick={showDetails}
          disabled={busy === "details"}
        />
        <ActionButton
          label={frozen ? "Unfreeze" : "Freeze"}
          icon={I.snow}
          onClick={toggleFreeze}
          disabled={busy === "freeze" || busy === "unfreeze"}
        />
        <ActionButton
          label={row.demo ? "Remove" : "Close"}
          icon={I.trash}
          onClick={() => setClosing(true)}
          disabled={busy === "delete"}
          danger
        />
      </div>

      {/* Spend against the tier's limit — derived from the history that is
          already loaded, so it costs nothing extra to show. */}
      <div className="flex flex-col gap-2 p-4" style={glass}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>
            Spent this month
          </span>
          <span className="font-mono text-sm tabular-nums">
            {usd(Math.max(0, spent))}{" "}
            <span style={{ color: "var(--text-faint)" }}>of {tier.limit}</span>
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.07)", borderRadius: "var(--r-pill)" }}
        >
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: "var(--brand-gradient)",
              transition: "width 400ms var(--ease-out)",
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => (txns ? setTxns(null) : showTxns())}
          className="bv-press flex items-center justify-between gap-3 py-1"
          disabled={busy === "transactions"}
        >
          <span className="text-sm font-medium">Transaction history</span>
          <span
            style={{
              color: "var(--text-faint)",
              transform: txns ? "rotate(90deg)" : undefined,
              transition: "transform 180ms var(--ease-out)",
            }}
          >
            {busy === "transactions" ? "…" : I.chevron}
          </span>
        </button>

        {txns && (
          <div className="flex flex-col">
            {txns.length === 0 && (
              <span className="py-2 text-xs" style={{ color: "var(--text-faint)" }}>
                No transactions yet
              </span>
            )}
            {txns.map((t, i) => (
              <div
                key={`${t.date}-${i}`}
                className="flex items-center justify-between gap-3 py-2.5"
                style={{ borderBottom: i < txns.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs">{t.merchant || t.type}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {t.date} · {t.status}
                  </span>
                </div>
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{ color: t.type === "Refund" ? "var(--positive)" : undefined }}
                >
                  {t.type === "Refund" ? "+" : "−"}
                  {usd(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={depositing} onClose={() => setDepositing(false)} title="Add funds">
        <Field
          label={`Amount (USD · min $${MIN_FUNDABLE.toFixed(2)})`}
          value={depAmount}
          onChange={setDepAmount}
          placeholder={MIN_FUNDABLE.toFixed(2)}
        />
        <div className="flex flex-wrap gap-2">
          {TOPUP_PRESETS.filter((p) => p >= MIN_FUNDABLE).map((p) => {
            const on = depNum === p;
            return (
              <button
                key={p}
                onClick={() => setDepAmount(String(p))}
                className="bv-press px-3 py-1.5 text-xs"
                style={{
                  background: on ? "var(--brand-soft)" : "var(--surface-2)",
                  border: `1px solid ${on ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                  borderRadius: "var(--r-pill)",
                  color: on ? "var(--brand)" : "var(--text-dim)",
                }}
              >
                ${p}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          <FeeRow
            label="Funding fee (4%)"
            value={usd(depFunding)}
            struck={tier.id === "platinum"}
          />
          <FeeRow
            label="Processing fee"
            value={usd(depValid ? PROCESSING_FEE : 0)}
            struck={tier.id === "platinum"}
          />
          {/* Taken on the way in, before any of the above. Shown because the
              total has to add up — it was missing, and the screen quoted a
              figure a percent below what actually left the wallet. */}
          <FeeRow
            label={`Deposit fee (${DEPOSIT_FEE_RATE * 100}%)`}
            value={usd(depValid ? depTotal - depNum - depFee : 0)}
          />
          {tier.id === "platinum" && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--text-faint)" }}>Platinum</span>
              <span style={{ color: "var(--positive)" }}>Fees waived</span>
            </div>
          )}
          <div
            className="mt-1 flex items-center justify-between pt-2 text-sm font-semibold"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span>Total</span>
            <span className="font-mono tabular-nums">{usd(depTotal)}</span>
          </div>
          {/* The reason the total is worth trusting: it is derived from the
              figure typed above, not the other way round. */}
          <p className="text-[11px] leading-4" style={{ color: "var(--text-faint)" }}>
            {usd(depValid ? depNum : 0)} lands on the card.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Pay with
          </span>
          <div className="flex gap-2">
            {(["USDG", "ETH"] as const).map((a) => {
              const on = payAsset === a;
              return (
                <button
                  key={a}
                  onClick={() => setPayAsset(a)}
                  className="bv-press flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-medium"
                  style={{
                    background: on ? "var(--brand-soft)" : "var(--surface-2)",
                    border: `1px solid ${on ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                    borderRadius: "var(--r-card)",
                    color: on ? "var(--brand)" : "var(--text-dim)",
                  }}
                >
                  {coinIcon(a, 20)}
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] leading-5" style={{ color: "var(--text-faint)" }}>
          Paid from your Robinhood Chain balance and bridged to the card in a few
          seconds.
          {payAsset === "ETH" && (
            <>
              {" "}
              ETH moves against the dollar, so the amount is fixed when you sign.
            </>
          )}
        </p>
        {depStage && (
          <p className="text-center text-[11px]" style={{ color: "var(--brand)" }}>
            {depStage}
          </p>
        )}
        <Button
          onClick={() => {
            if (row.demo) return toast("error", "Preview card — deposits are disabled");
            if (!FUNDING_SUPPORTED) {
              return toast("error", "Deposits need mainnet — this build is on testnet");
            }
            void deposit();
          }}
          disabled={!depValid || busy === "deposit"}
          className="h-12 w-full"
        >
          {busy === "deposit" ? "Working…" : "Continue"}
        </Button>
      </Sheet>

      <Sheet open={!!details} onClose={() => setDetails(null)} title="Card details">
        {details && (
          <>
            {/* Copies the digits unspaced — the spacing is for reading, and a
                checkout that rejects spaces is the whole reason to have this. */}
            <button
              onClick={() => copy(details.card_number)}
              className="bv-press flex items-center justify-between gap-3 p-4 text-left"
              style={{ ...glass, background: "rgba(0,0,0,0.25)" }}
              aria-label="Copy card number"
            >
              <span className="font-mono text-base tracking-widest">
                {details.card_number.replace(/(.{4})/g, "$1 ").trim()}
              </span>
              <span
                className="shrink-0 text-[11px] font-medium"
                style={{ color: copied ? "var(--brand)" : "var(--text-faint)" }}
              >
                {copied ? "Copied" : <CopyIcon />}
              </span>
            </button>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1 p-3" style={glass}>
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Expiry
                </span>
                <span className="font-mono text-sm">{details.expiry}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3" style={glass}>
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  CVV
                </span>
                <span className="font-mono text-sm">{details.cvv}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3" style={glass}>
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Status
                </span>
                <span className="text-sm capitalize">{details.status}</span>
              </div>
            </div>
          </>
        )}
      </Sheet>

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title={row.demo ? "Remove this preview?" : "Close this card?"}
      >
        {/* The card itself, so it's obvious which one is about to go. */}
        <div className="mx-auto w-3/4">
          <CardFace row={row} />
        </div>

        <div className="flex items-center justify-between gap-3 px-1 text-xs">
          <span style={{ color: "var(--text-faint)" }}>Balance on the card</span>
          <span className="font-mono tabular-nums">
            {details ? usd(details.balance) : balance !== null ? usd(balance) : "—"}
          </span>
        </div>
        {!row.demo && (
          <div className="flex items-center justify-between gap-3 px-1 text-xs">
            <span style={{ color: "var(--text-faint)" }}>Closing fee</span>
            <span className="font-mono tabular-nums">{usd(2)}</span>
          </div>
        )}

        <p className="text-sm leading-6" style={{ color: "var(--text-dim)" }}>
          {row.demo ? (
            "A preview card — nothing was charged and nothing is returned."
          ) : (
            <>
              The card stops working immediately and cannot be reopened. Whatever is
              left on it comes back to your account, minus the closing fee.
            </>
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setClosing(false)}
            className="bv-press bv-btn-ghost h-12 flex-1 text-sm"
          >
            Keep it
          </button>
          <Button
            onClick={closeCard}
            disabled={busy === "delete"}
            className="h-12 flex-1"
            style={{ background: "var(--negative)", color: "#fff" }}
          >
            {busy === "delete" ? "Closing…" : row.demo ? "Remove" : "Close card"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export function EvmCards() {
  const api = useAuthedFetch();
  const toast = useToast();
  const [cards, setCards] = useState<CardRow[] | null>(null);
  // The cover always leads, whether or not there are cards behind it — it is
  // the front of the product, not a first-run screen. "cover" is the deck.
  const [stage, setStage] = useState<"cover" | "intro" | "empty" | "tiers" | "form">("intro");
  const [tier, setTier] = useState<Tier>(TIERS[0]!);
  const [active, setActive] = useState(0);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(
    String(Math.max(MIN_OPENABLE, TIERS[0]!.minDeposit))
  );
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Same picker and same default as a top-up — USDG lands exactly, ETH drifts
  // between the quote and the signature.
  const [payAsset, setPayAsset] = useState<"USDG" | "ETH">("USDG");
  const [openStage, setOpenStage] = useState<string | null>(null);
  const { walletClient, address } = useEvmWallet();
  // Derived, not synced. An effect that setStates on mount is what this repo's
  // lint rule exists to stop, and there is nothing to subscribe to here —
  // storage only changes when this component writes it, so a counter re-reads.
  const [openEpoch, setOpenEpoch] = useState(0);
  const pendingOpen = useMemo(
    () => (address ? readOpen(address) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, openEpoch]
  );

  // Returns rows rather than setting them, so the mount effect can do its
  // setState inside a promise callback instead of synchronously in the body.
  const fetchCards = useCallback(
    () => api<{ cards: CardRow[] }>("/api/cards", { action: "list" }),
    [api]
  );

  // The server has never heard of a preview card, so a list response would
  // wipe one. Keep them and put the real cards behind.
  const merge = (server: CardRow[], prev: CardRow[] | null): CardRow[] => [
    ...(prev ?? []).filter((c) => c.demo),
    ...server,
  ];

  // Fetch exactly once. Privy's getAccessToken isn't referentially stable, so
  // `api` — and every callback built on it — changes identity each render; with
  // that in the dep list this effect re-ran continuously and every refetch
  // clobbered whatever was on screen.
  // No cancellation flag alongside the guard: in dev StrictMode the effect runs,
  // cleans up, and runs again — the cleanup would cancel the only fetch the
  // guard allows, and the list would load forever. One fetch, no cancel.
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetchCards()
      .then((r) => setCards((prev) => merge(r.cards, prev)))
      .catch((e: unknown) => {
        // Recorded, not swallowed. An empty array here is indistinguishable from
        // owning nothing, and the screen says so out loud — which is how a
        // rate-limit or an expired session came to look like a missing card.
        setLoadError((e as Error).message || "request failed");
        setCards((prev) => prev ?? []);
      });
  }, [fetchCards]);

  async function retryLoad() {
    setLoadError(null);
    try {
      const fresh = (await fetchCards()).cards;
      setCards((prev) => merge(fresh, prev));
    } catch (e) {
      setLoadError((e as Error).message || "request failed");
    }
  }

  // Itemised because a single "fees" figure is how people end up surprised.
  // Platinum waives it for the user, which means we pay it, so it still has to
  // be computed either way.
  // Each tier can ask for more than the provider's floor — that is what makes a
  // tier a tier. Standard sits on the floor; Gold and Platinum sit above it.
  // MIN_OPENABLE, not the card's $10: a $10 balance needs a deposit their rail
  // refuses, so offering it would be offering a card that cannot be bought.
  const minOpen = Math.max(MIN_OPENABLE, tier.minDeposit);
  const openPresets = [minOpen, ...OPEN_PRESETS.filter((p) => p > minOpen)];

  const amountNum = Number(amount);
  const validAmount = Number.isFinite(amountNum) && amountNum >= minOpen;
  const funding = validAmount ? amountNum * FUNDING_RATE : 0;
  const rawFee = validAmount ? ISSUANCE_FEE + funding + PROCESSING_FEE : 0;
  const waived = tier.id === "platinum";
  const fee = waived ? 0 : rawFee;
  const openTotal = (validAmount ? amountNum : 0) + fee;
  // What the wallet is actually asked for, once the provider's inbound cut is
  // added on. The button quotes this, because this is what gets signed.
  const openCharged = validAmount ? depositToOpen(amountNum) : 0;

  function pickTier(t: Tier) {
    setTier(t);
    // Seed with the tier's own floor, or Gold would open on a Standard amount.
    setAmount(String(Math.max(MIN_OPENABLE, t.minDeposit)));
    setStage("form");
  }

  /** Builds the card locally so the screen can be reviewed. No API, no money. */
  function createPreview() {
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    setCards((c) => [
      {
        cardId: `preview-${last4}`,
        last4,
        bin: BIN,
        createdAt: Date.now(),
        holder: name.trim(),
        tierId: tier.id,
        demo: true,
        demoBalance: amountNum,
      },
      ...(c ?? []),
    ]);
    setActive(0);
    setStage("cover");
    setName("");
    toast("success", "Preview card added");
  }

  /**
   * Turn a landed payment into a card, waiting for it to land if it hasn't.
   *
   * Relay filling and the provider crediting are separate events, minutes
   * apart: the first attempt at this asked immediately, got "payment hasn't
   * landed yet", and left someone paid up with no card. Polls rather than
   * fails, at 15s — our own limiter allows six calls a minute per wallet, and
   * tripping it would turn a slow payment into a broken one.
   */
  async function issue(open: PendingOpen) {
    const deadline = Date.now() + 6 * 60_000;
    for (let attempt = 0; ; attempt++) {
      try {
        setOpenStage(attempt === 0 ? "Issuing the card…" : "Waiting for the payment to clear…");
        await api("/api/cards", {
          action: "create",
          depositId: open.depositId,
          bin: BIN,
          amount: open.amount,
          nameOnCard: open.nameOnCard,
          tierId: open.tierId,
        });
        break;
      } catch (e) {
        const landed = /hasn't landed/i.test((e as Error).message);
        if (!landed || Date.now() > deadline) throw e;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    if (address) forgetOpen(address);
    setOpenEpoch((n) => n + 1);
    toast("success", "Card created");
    setActive(0);
    setStage("cover");
    setName("");
    const fresh = (await fetchCards()).cards;
    setCards((prev) => merge(fresh, prev));
  }

  /** Finish a payment that outlived its tab. */
  async function resume() {
    if (!pendingOpen) return;
    setBusy(true);
    try {
      await issue(pendingOpen);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setOpenStage(null);
      setBusy(false);
    }
  }

  /**
   * Pay for the card, then issue it. Same rail as a top-up: open a deposit
   * intent, bridge to the address it hands back, and only then ask the server
   * for a card — which re-checks with the provider that the money arrived.
   *
   * Until this existed, opening a card cost the user nothing and spent our
   * provider balance instead.
   */
  async function create() {
    if (!walletClient || !address) return toast("error", "Connect your wallet first");
    if (!FUNDING_SUPPORTED) {
      return toast("error", "Opening a card needs mainnet — this build is on testnet");
    }
    setBusy(true);
    try {
      // The server prices this: the balance is what the user picked, but the
      // deposit has to carry the fees and the provider's cut on top.
      setOpenStage("Opening a payment…");
      const { deposit: d } = await api<{
        deposit: { id: string; pay_address: string; pay_amount: string };
      }>("/api/cards", { action: "deposit", openAmount: amountNum });

      setOpenStage("Pricing the route…");
      const quote = await getPayoutQuote({
        user: address,
        from: payAsset,
        amount: parseUnits(d.pay_amount, USDT_DECIMALS),
        exactOutput: true,
        to: { chainId: SOLANA_CHAIN_ID, currency: SOLANA_USDT, recipient: d.pay_address },
      });

      // Written down before a single token moves. Everything after this point
      // is recoverable only if we still know which payment was ours — lose the
      // id and the money is credited to an account the user cannot reach.
      rememberOpen(address, {
        depositId: d.id,
        amount: amountNum,
        nameOnCard: name.trim(),
        tierId: tier.id,
      });

      setOpenStage(`Confirm ${quote.inFormatted} ${quote.inSymbol} in your wallet…`);
      await executeFunding(quote, ACTIVE_EVM_CHAIN, walletClient, (s) => setOpenStage(s));

      await issue({
        depositId: d.id,
        amount: amountNum,
        nameOnCard: name.trim(),
        tierId: tier.id,
      });
    } catch (e) {
      // The bridge may well have gone through. Never phrase this as though the
      // money is gone — it is most likely sitting as an unspent deposit, and
      // the banner on the cover will offer to finish the job.
      toast("error", (e as Error).message);
    } finally {
      setOpenStage(null);
      setBusy(false);
    }
  }

  // The cover, whether this is a first visit or a return one.
  if (stage === "intro" || (cards?.length === 0 && stage === "cover")) {
    return (
      // pb-28 on mobile clears the pinned button; from md it's back in flow.
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col justify-center px-6 pb-28 sm:px-8 md:max-w-4xl md:pb-0 lg:max-w-5xl">
        {/* Straight to the tiers when they already have a card — the empty
            state's job is telling a first-timer there is nothing here yet. */}
        <Cover
          onOpen={() => setStage(cards?.length ? "tiers" : "empty")}
          onBack={cards?.length ? () => setStage("cover") : undefined}
          error={loadError}
          onRetry={retryLoad}
          pending={pendingOpen}
          onResume={resume}
          busy={busy}
          stage={openStage}
        />
      </div>
    );
  }

  const form = (
    <div className="flex flex-col gap-3 p-4" style={glass}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{tier.name}</span>
        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Limit {tier.limit}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
        Visa · issued in the United States · Apple, Google &amp; Samsung Pay
      </p>

      <Field label="Name on card" value={name} onChange={setName} placeholder="John Alex" />
      <Field
        label={`Opening balance (USD · min $${minOpen})`}
        value={amount}
        onChange={setAmount}
        placeholder={String(minOpen)}
      />
      <div className="flex flex-wrap gap-2">
        {openPresets.map((p) => {
          const on = amountNum === p;
          return (
            <button
              key={p}
              onClick={() => setAmount(String(p))}
              className="bv-press px-3 py-1.5 text-xs"
              style={{
                background: on ? "var(--brand-soft)" : "var(--surface-2)",
                border: `1px solid ${on ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                borderRadius: "var(--r-pill)",
                color: on ? "var(--brand)" : "var(--text-dim)",
              }}
            >
              ${p}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <FeeRow label="Issuance fee" value={usd(ISSUANCE_FEE)} struck={waived} />
        <FeeRow label="Funding fee (4%)" value={usd(funding)} struck={waived} />
        <FeeRow label="Processing fee" value={usd(PROCESSING_FEE)} struck={waived} />
        {waived && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: "var(--text-faint)" }}>Platinum</span>
            <span style={{ color: "var(--positive)" }}>Fees waived</span>
          </div>
        )}
        <div
          className="mt-1 flex items-center justify-between pt-2 text-sm font-semibold"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span>Cost to open</span>
          <span className="font-mono tabular-nums">{usd(fee)}</span>
        </div>

        {/* Charged alongside the fees and there is no way around it — their
            endpoint takes an amount or refuses. Kept out of "cost to open"
            because it isn't a cost: it stays yours, on the card. */}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span style={{ color: "var(--text-faint)" }}>
            + opening balance, stays yours
          </span>
          <span className="font-mono tabular-nums">
            {usd(validAmount ? amountNum : 0)}
          </span>
        </div>
        {/* The floor only applies to opening — worth saying here, or the $25
            looks like what every future top-up will cost too. */}
        <p className="text-[11px] leading-4" style={{ color: "var(--text-faint)" }}>
          Only required to open. After this you can top up from $
          {MIN_FUNDABLE.toFixed(2)}, any amount, any time.
        </p>
        {/* Their cut on the way in. Listed for the same reason as everywhere
            else here: the total has to be the number that leaves the wallet. */}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span style={{ color: "var(--text-faint)" }}>
            Deposit fee ({DEPOSIT_FEE_RATE * 100}%)
          </span>
          <span className="font-mono tabular-nums">
            {usd(validAmount ? openCharged - openTotal : 0)}
          </span>
        </div>
        <div
          className="mt-1 flex items-center justify-between pt-2 text-sm font-semibold"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span>Charged now</span>
          <span className="font-mono tabular-nums">{usd(openCharged)}</span>
        </div>
      </div>

      <div
        className="flex items-start gap-2.5 p-3"
        style={{ ...glass, background: "rgba(216,180,94,0.06)" }}
      >
        <span className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }}>
          <FlameIcon />
        </span>
        <p className="text-[11px] leading-5" style={{ color: "var(--text-dim)" }}>
          <strong style={{ color: "var(--text)" }}>100% of the issuance fee is burned.</strong>{" "}
          Paid once, when the card is opened — top-ups never carry it again.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Pay with
        </span>
        <div className="flex gap-2">
          {(["USDG", "ETH"] as const).map((a) => {
            const on = payAsset === a;
            return (
              <button
                key={a}
                onClick={() => setPayAsset(a)}
                className="bv-press flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-medium"
                style={{
                  background: on ? "var(--brand-soft)" : "var(--surface-2)",
                  border: `1px solid ${on ? "rgba(216,180,94,0.4)" : "var(--border)"}`,
                  borderRadius: "var(--r-card)",
                  color: on ? "var(--brand)" : "var(--text-dim)",
                }}
              >
                {coinIcon(a, 20)}
                {a}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-5" style={{ color: "var(--text-faint)" }}>
          Taken from your Robinhood Chain balance and bridged to the card.
          {payAsset === "ETH" && (
            <> ETH moves against the dollar, so the amount is fixed when you sign.</>
          )}
        </p>
      </div>

      {openStage && (
        <p className="text-center text-[11px]" style={{ color: "var(--brand)" }}>
          {openStage}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setStage("tiers")}
          className="bv-press bv-btn-ghost h-11 flex-1 text-sm"
          disabled={busy}
        >
          Back
        </button>
        <Button
          onClick={create}
          disabled={busy || !validAmount || name.trim().length < 2}
          className="h-11 flex-1"
        >
          {/* The whole figure, because the whole figure is now what leaves the
              wallet — it used to say the fee alone and charge nothing at all. */}
          {busy ? "Opening…" : `Open · ${usd(openCharged)}`}
        </Button>
      </div>

      {/* Says what the networks actually give you — 3DS and the fraud rails —
          rather than a vague reassurance about being safe. */}
      <div
        className="flex items-start gap-2.5 p-3"
        style={{ ...glass, background: "rgba(255,255,255,0.03)" }}
      >
        <span className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }}>
          <SpecIcon.Shield />
        </span>
        <p className="text-[11px] leading-5" style={{ color: "var(--text-dim)" }}>
          Every payment runs on Visa and Mastercard rails with 3-D Secure, an
          independent PIN, and their fraud monitoring — the same protection as a
          bank card.
        </p>
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-bold italic tracking-tight">VISA</span>
          <MastercardMark size={18} />
        </span>
      </div>

      {/* Real creation charges the provider account the moment it succeeds, so
          there is a way to see the screen first without spending anything. */}
      <button
        onClick={createPreview}
        disabled={!validAmount || name.trim().length < 2}
        className="bv-press h-10 w-full text-xs disabled:opacity-40"
        style={{ color: "var(--text-dim)" }}
      >
        Preview without paying
      </button>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 sm:px-8">
      {cards === null && (
        <>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </>
      )}

      {/* The list is the whole screen while picking or filling in a new card —
          scrolling past your existing cards to reach the form is noise. */}
      {stage === "cover" && !!cards?.length && (
        <>
          <h3 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
            Select card
          </h3>
          <CardDeck
            cards={cards}
            active={Math.min(active, cards.length)}
            onActive={setActive}
            onCreate={() => setStage("intro")}
          />
          {/* Nothing below the deck while the create slot is in front — the
              actions belong to a card, and that slot is not one. */}
          {active < cards.length && (
            <CardItem
              key={cards[active]!.cardId}
              row={cards[active]!}
              onDelete={(id) => {
                setCards((list) => (list ?? []).filter((x) => x.cardId !== id));
                setActive(0);
              }}
            />
          )}
        </>
      )}

      {stage === "empty" && <EmptyState onStart={() => setStage("tiers")} />}
      {stage === "tiers" && (
        <TierPicker
          onPick={pickTier}
          onBack={() => setStage(cards?.length ? "intro" : "empty")}
        />
      )}
      {stage === "form" && form}
    </div>
  );
}
