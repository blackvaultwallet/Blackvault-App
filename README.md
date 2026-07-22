# BlackVault — Private Banking On-Chain

**Live at [app.blackvault.cash](https://app.blackvault.cash)** — a privacy-first
wallet on **Robinhood Chain** (mainnet). Stealth transfers, human-readable
private payments, biometric app lock, and an AI vault keeper — private by
default, auditable by choice.

> **This is the source-available release.** The complete UI, the project
> structure, the dependency graph, and every mechanism are here to read —
> but the core server routes, the stealth-rail internals, and the payment
> verification are **redacted stubs** (each file documents its mechanism and
> points to [ARCHITECTURE.md](./ARCHITECTURE.md)). This release is not meant to
> build or run; the deployable source lives in a private repository.

## What the product does

- **Public + private money on one home.** Regular sends, and stealth sends
  (ERC-5564) where the recipient is a one-time address only they can spend —
  no link between sender and receiver on-chain.
- **BlackVault Names** — self-hosted ENS subnames (`you.blackvaultwallet.eth`)
  with an optional on-chain USDG claim fee, resolvable anywhere ENS works
  (CCIP-Read gateway + on-chain resolver).
- **IP privacy everywhere.** RPC, ENS lookups, prices, news, images, and
  embeds are all same-origin proxies — no third party ever sees a user IP
  next to a wallet address.
- **Biometric app lock** (WebAuthn platform credential) gating app open, the
  Private Vault, and key export. Sign-in stays Google/email via embedded
  wallets (Privy) — real key export anytime.
- **Full-story Activity** — semantic journal (name purchases, QR payments,
  payment requests) merged with on-chain transfers and the private log.
- **Vault Keeper** — an AI assistant with portfolio context, served through a
  rate-limited backend.
- **Private Degen (soon)** — shielded trading preview driven by live trending
  data for RH Chain pools.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind · viem · Privy embedded wallets
· Upstash Redis (rate limiting) · Postgres/Supabase (names) · Alchemy +
Blockscout RPC split · deployed on Vercel. Monorepo: `apps/web` + `packages/sdk`.

## Reading guide

| Where | What you'll find |
| --- | --- |
| `apps/web/src/ui/` | The complete production UI, unredacted |
| `apps/web/src/app/api/` | Server routes as documented stubs (mechanism per file) |
| `apps/web/src/lib/chain/` | Chain adapters; stealth core + rail are documented stubs |
| `ARCHITECTURE.md` | End-to-end flows: stealth transfer, paid names, proxy privacy, app lock |

## License

No license is granted. All rights reserved — this repository exists for
transparency and review, not for reuse.
