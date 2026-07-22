// apps/web/src/lib/chain/evm/stealth.ts
//
// [ REDACTED - source-available release ]
//
// Mechanism: ERC-5564 stealth core: derive a stealth identity (spending+viewing keypairs) deterministically from one wallet signature; compute one-time stealth addresses for recipients; announce via the canonical ERC-5564 announcer; scan announcements with the viewing key; claim by deriving the one-time private key. Receipt-checked at every step so a failed announce can never strand funds.
//
// The full implementation lives in the private deployment repository.
// End-to-end flows are documented in ARCHITECTURE.md at the repo root.

export {};
