// Self-hosted subname store (server-only). Maps a subname → address, one name
// per address. With NAMES_DATABASE_URL (or DATABASE_URL) set it uses Postgres
// (Supabase, transaction pooler) — otherwise it falls back to a local JSON
// file for dev. Same interface either way; this replaced NameStone.

import { promises as fs } from "fs";
import path from "path";
import postgres from "postgres";

export interface NameRecord {
  name: string; // the label only, lowercase (e.g. "alice")
  address: string;
  createdAt: number;
}

/* ---------- Postgres adapter ---------- */

const DB_URL = process.env.NAMES_DATABASE_URL ?? process.env.DATABASE_URL;

// Supabase's transaction pooler forbids prepared statements → prepare: false.
// Small pool: serverless instances each hold at most one connection.
const sql = DB_URL ? postgres(DB_URL, { prepare: false, max: 1 }) : null;

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!sql) return Promise.resolve();
  ready ??= sql`
    create table if not exists names (
      name text primary key,
      address text not null,
      created_at timestamptz not null default now()
    )`
    .then(() => sql`create index if not exists names_address_idx on names (lower(address))`)
    .then(
      () => sql`
        create table if not exists name_payments (
          tx_hash text primary key,
          name text not null,
          address text not null,
          created_at timestamptz not null default now()
        )`
    )
    .then(() => {});
  return ready;
}

interface Row {
  name: string;
  address: string;
  created_at: string | Date;
}

const toRec = (r: Row): NameRecord => ({
  name: r.name,
  address: r.address,
  createdAt: new Date(r.created_at).getTime(),
});

/* ---------- JSON file fallback (dev) ---------- */

const FILE = path.join(process.cwd(), ".data", "names.json");
let cache: Record<string, NameRecord> | null = null;

async function load(): Promise<Record<string, NameRecord>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, NameRecord>;
  } catch {
    cache = {};
  }
  return cache;
}

async function save(data: Record<string, NameRecord>): Promise<void> {
  cache = data;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // read-only FS (serverless) — dev-only path; prod uses the DB adapter
  }
}

/* ---------- public interface ---------- */

export async function getByName(name: string): Promise<NameRecord | null> {
  const key = name.toLowerCase();
  if (sql) {
    await ensureTable();
    const rows = await sql<Row[]>`select * from names where name = ${key}`;
    return rows[0] ? toRec(rows[0]) : null;
  }
  const d = await load();
  return d[key] ?? null;
}

export async function getByAddress(address: string): Promise<NameRecord | null> {
  const a = address.toLowerCase();
  if (sql) {
    await ensureTable();
    const rows = await sql<Row[]>`select * from names where lower(address) = ${a}`;
    return rows[0] ? toRec(rows[0]) : null;
  }
  const d = await load();
  return Object.values(d).find((r) => r.address.toLowerCase() === a) ?? null;
}

export async function claimName(
  name: string,
  address: string,
  paymentTx?: string
): Promise<NameRecord> {
  const key = name.toLowerCase();
  if (sql) {
    await ensureTable();
    // One transaction: burn the payment (unique tx hash = anti-replay), free
    // the caller's previous name, then take the new one. A concurrent claim of
    // the same name loses on the primary-key conflict.
    try {
      const rows = await sql.begin(async (tx) => {
        if (paymentTx) {
          await tx`insert into name_payments (tx_hash, name, address)
                   values (${paymentTx.toLowerCase()}, ${key}, ${address})`;
        }
        await tx`delete from names where lower(address) = ${address.toLowerCase()}`;
        return tx<Row[]>`insert into names (name, address) values (${key}, ${address}) returning *`;
      });
      return toRec((rows as Row[])[0]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        const msg = (e as Error).message ?? "";
        throw new Error(msg.includes("name_payments") ? "Payment already used" : "Name already taken");
      }
      throw e;
    }
  }
  const d = await load();
  if (d[key]) throw new Error("Name already taken");
  const prev = Object.values(d).find((r) => r.address.toLowerCase() === address.toLowerCase());
  if (prev) delete d[prev.name.toLowerCase()];
  const rec: NameRecord = { name: key, address, createdAt: Date.now() };
  d[key] = rec;
  await save(d);
  return rec;
}
