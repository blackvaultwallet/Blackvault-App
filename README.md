# BlackVault

A privacy-first crypto wallet. Send, receive, and hold with sender/recipient
privacy built in — recipient-privacy on EVM via ERC-5564 stealth addresses,
full shielded transfers on Solana via Umbra, plus a self-hosted ENS subname
service (`*.blackvaultwallet.eth`) for human-readable, private addresses.

> **Status:** active development. Not audited. Do not use with real funds on
> mainnet yet. Some `api/*` routes are dev/testnet-only spikes — see
> [Security](#security) before hosting.

## Stack

- **apps/web** — Next.js 16 (App Router, Turbopack), React 19, Tailwind.
  Embedded wallets via Privy.
- **packages/sdk** — chain adapters and the shared privacy-rail interface.
- Chain is selected at build time with `NEXT_PUBLIC_CHAIN`
  (`robinhood` for Robinhood Chain / EVM, `solana` for Solana).

## Features

- Stealth send/receive (recipient privacy) on EVM; shielded pool on Solana.
- IP privacy: RPC, ENS, news, and image requests are proxied server-side so
  providers never see the user's IP.
- BlackVault Names — self-hosted ENS subname issuance (CCIP-Read offchain
  resolver), verified end-to-end on Sepolia.
- News Hub, private payment requests (QR + link), and a Vault Keeper assistant.

## Getting started

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # then fill in the values
pnpm --filter web dev
```

Requires Node 20+ and pnpm.

## Security

- Secrets live only in `.env.local` (gitignored) — never commit them.
- The `NAMES_*` signing key must be a **throwaway testnet key** until mainnet.
- Before public hosting or mainnet: add auth + rate limiting to `api/agent`,
  and gate or remove the server-spend dev routes (`api/sns/*`, `api/umbra/*`)
  behind a `NODE_ENV === 'production'` guard.

## License

No license granted yet — all rights reserved until one is added.
