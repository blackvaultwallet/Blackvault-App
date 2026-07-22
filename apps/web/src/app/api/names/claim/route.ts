// apps/web/src/app/api/names/claim/route.ts
//
// [ REDACTED - source-available release ]
//
// Mechanism: Subname claim with on-chain payment verification: fetch the tx receipt server-side, check an ERC-20 USDG Transfer log (token, from=claimer, to=revenue wallet, amount >= price), burn the tx hash (unique) so a payment can never be replayed, then record the name.
//
// The full implementation lives in the private deployment repository.
// End-to-end flows are documented in ARCHITECTURE.md at the repo root.

export {};
