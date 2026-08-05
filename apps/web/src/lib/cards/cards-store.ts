import "server-only";

// Who owns which card. Cards are issued under OUR Kripicard account, so the
// provider has no idea which wallet a card belongs to — that mapping only
// exists here, and it is the only thing standing between a user and someone
// else's card number. Every route must check it before touching a card_id.
//
// Same shape as names-store: Postgres when a DATABASE_URL is around, JSON file
// otherwise so local dev works with nothing installed.

import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";

export interface CardRecord {
  cardId: string;
  /** Owning wallet, lowercase. */
  address: string;
  /** Last four digits — safe to show in a list without another API call. */
  last4: string;
  bin: string;
  /** Name embossed on the card. We send it at creation and the provider never
   *  gives it back, so it is kept here or it is lost. */
  holder: string;
  /** Which of our tiers was chosen — ours, not the provider's. */
  tierId: string;
  createdAt: number;
}

const DB_URL =
  process.env.CARDS_DATABASE_URL ??
  process.env.NAMES_DATABASE_URL ??
  process.env.DATABASE_URL;

const sql = DB_URL ? postgres(DB_URL, { prepare: false, max: 1 }) : null;

/**
 * A deposit in flight. The provider credits one shared account, so without this
 * row we would know money arrived but not whose it was, or what it was for.
 */
export interface DepositRecord {
  depositId: string;
  address: string;
  /** Card to fund once it lands; null means the user is creating a new one. */
  cardId: string | null;
  /** What the account gets credited, after the provider's deposit fee. */
  creditUsd: number;
  status: "pending" | "applied";
  createdAt: number;
}

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= sql`
    create table if not exists cards (
      card_id text primary key,
      address text not null,
      last4 text not null default '',
      bin text not null default '',
      holder text not null default '',
      tier_id text not null default 'standard',
      created_at timestamptz not null default now()
    )`
    // Added after the table shipped, so bring existing deployments along.
    .then(() => sql`alter table cards add column if not exists holder text not null default ''`)
    .then(() => sql`alter table cards add column if not exists tier_id text not null default 'standard'`)
    .then(() => sql`create index if not exists cards_address_idx on cards (lower(address))`)
    .then(
      () => sql`
        create table if not exists card_deposits (
          deposit_id text primary key,
          address text not null,
          card_id text,
          credit_usd numeric not null,
          status text not null default 'pending',
          created_at timestamptz not null default now()
        )`
    )
    .then(
      () => sql`create index if not exists card_deposits_address_idx
                on card_deposits (lower(address))`
    )
    .then(() => {});
  return ready;
}

interface Row {
  card_id: string;
  address: string;
  last4: string;
  bin: string;
  holder: string;
  tier_id: string;
  created_at: string | Date;
}

const toRec = (r: Row): CardRecord => ({
  cardId: r.card_id,
  address: r.address,
  last4: r.last4,
  bin: r.bin,
  holder: r.holder ?? "",
  tierId: r.tier_id ?? "standard",
  createdAt: new Date(r.created_at).getTime(),
});

/* ---------- JSON file fallback (dev) ---------- */

interface FileShape {
  cards: Record<string, CardRecord>;
  deposits: Record<string, DepositRecord>;
}

const FILE = path.join(process.cwd(), ".data", "cards.json");
let cache: FileShape | null = null;

async function load(): Promise<FileShape> {
  if (cache) return cache;

  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch {
    // No file yet — the only case where "nobody owns anything" is the truth.
    cache = { cards: {}, deposits: {} };
    return cache;
  }

  // A file edited by hand can arrive with a byte order mark, and JSON.parse
  // rejects it outright. Strip it rather than lose the store over three bytes.
  // Anything else that fails to parse is left to throw: a corrupt store used to
  // come back as an empty one, which tells a user with a funded card that they
  // have none — the same lie, one layer down.
  const parsed = JSON.parse(raw.replace(/^﻿/, "")) as Partial<FileShape>;
  cache = { cards: parsed.cards ?? {}, deposits: parsed.deposits ?? {} };
  return cache;
}

async function save(data: FileShape): Promise<void> {
  cache = data;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // read-only FS (serverless) — dev-only path; prod uses the DB adapter
  }
}

/* ---------- public interface ---------- */

export async function listCards(address: string): Promise<CardRecord[]> {
  const a = address.toLowerCase();
  if (sql) {
    await ensureTable();
    const rows = await sql<Row[]>`
      select * from cards where lower(address) = ${a} order by created_at desc`;
    return rows.map(toRec);
  }
  const d = await load();
  return Object.values(d.cards)
    .filter((r) => r.address.toLowerCase() === a)
    .sort((x, y) => y.createdAt - x.createdAt);
}

export async function recordCard(rec: Omit<CardRecord, "createdAt">): Promise<void> {
  if (sql) {
    await ensureTable();
    await sql`
      insert into cards (card_id, address, last4, bin, holder, tier_id)
      values (${rec.cardId}, ${rec.address.toLowerCase()}, ${rec.last4}, ${rec.bin},
              ${rec.holder}, ${rec.tierId})
      on conflict (card_id) do nothing`;
    return;
  }
  const d = await load();
  d.cards[rec.cardId] = { ...rec, address: rec.address.toLowerCase(), createdAt: Date.now() };
  await save(d);
}

export async function forgetCard(cardId: string): Promise<void> {
  if (sql) {
    await ensureTable();
    await sql`delete from cards where card_id = ${cardId}`;
    return;
  }
  const d = await load();
  delete d.cards[cardId];
  await save(d);
}

/* ---------- deposits ---------- */

export async function recordDeposit(
  rec: Omit<DepositRecord, "createdAt" | "status">
): Promise<void> {
  if (sql) {
    await ensureTable();
    await sql`
      insert into card_deposits (deposit_id, address, card_id, credit_usd)
      values (${rec.depositId}, ${rec.address.toLowerCase()}, ${rec.cardId}, ${rec.creditUsd})
      on conflict (deposit_id) do nothing`;
    return;
  }
  const d = await load();
  d.deposits[rec.depositId] = {
    ...rec,
    address: rec.address.toLowerCase(),
    status: "pending",
    createdAt: Date.now(),
  };
  await save(d);
}

/**
 * Marks a deposit applied, and answers whether this call is the one that did
 * it. Two clients polling the same deposit must not both fund the card —
 * whoever flips it from pending wins, everyone else gets false.
 */
export async function claimDeposit(
  depositId: string,
  /** Omit only from the webhook, where HMAC already proved the caller. */
  address?: string
): Promise<DepositRecord | null> {
  const a = address?.toLowerCase();
  if (sql) {
    await ensureTable();
    const rows = await sql<
      { deposit_id: string; address: string; card_id: string | null; credit_usd: string; created_at: string | Date }[]
    >`
      update card_deposits set status = 'applied'
      where deposit_id = ${depositId} and status = 'pending'
        and (${a ?? null}::text is null or lower(address) = ${a ?? null})
      returning *`;
    const r = rows[0];
    return r
      ? {
          depositId: r.deposit_id,
          address: r.address,
          cardId: r.card_id,
          creditUsd: Number(r.credit_usd),
          status: "applied",
          createdAt: new Date(r.created_at).getTime(),
        }
      : null;
  }
  const d = await load();
  const rec = d.deposits[depositId];
  if (!rec || rec.status !== "pending") return null;
  if (a && rec.address.toLowerCase() !== a) return null;
  rec.status = "applied";
  await save(d);
  return rec;
}

/** Deposit ids still waiting — the webhook matches its payload against these. */
export async function pendingDepositIds(): Promise<string[]> {
  if (sql) {
    await ensureTable();
    const rows = await sql<{ deposit_id: string }[]>`
      select deposit_id from card_deposits where status = 'pending'`;
    return rows.map((r) => r.deposit_id);
  }
  const d = await load();
  return Object.values(d.deposits)
    .filter((r) => r.status === "pending")
    .map((r) => r.depositId);
}

/**
 * Puts a claimed deposit back to pending. Used when funding fails after the
 * claim — otherwise the money is credited to our account, marked spent, and the
 * user has nothing and no way to retry.
 */
export async function releaseDeposit(depositId: string): Promise<void> {
  if (sql) {
    await ensureTable();
    await sql`update card_deposits set status = 'pending' where deposit_id = ${depositId}`;
    return;
  }
  const d = await load();
  const rec = d.deposits[depositId];
  if (rec) {
    rec.status = "pending";
    await save(d);
  }
}

/**
 * Throws unless this wallet owns this card. Routes call it before every
 * provider call that takes a card_id — without it, a caller could pass any id
 * and read the card number back.
 */
export async function assertOwns(address: string, cardId: string): Promise<void> {
  const a = address.toLowerCase();
  if (sql) {
    await ensureTable();
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from cards
      where card_id = ${cardId} and lower(address) = ${a}`;
    if (!rows[0]?.n) throw new Error("Card not found");
    return;
  }
  const d = await load();
  // Same message whether it doesn't exist or belongs to someone else — the
  // difference would let a caller probe which card ids are real.
  if (d.cards[cardId]?.address.toLowerCase() !== a) throw new Error("Card not found");
}
