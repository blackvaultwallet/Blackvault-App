// apps/web/src/app/api/names/gateway/[sender]/[data]/route.ts
//
// [ REDACTED - source-available release ]
//
// Mechanism: CCIP-Read (ERC-3668 / ENSIP-10) gateway: decodes resolve(bytes,bytes), DNS-decodes the queried name, verifies namehash, looks up the store, and signs the answer (keccak of 0x1900 || resolver || expiry || callData-hash || result-hash) so the on-chain resolver can verify it.
//
// The full implementation lives in the private deployment repository.
// End-to-end flows are documented in ARCHITECTURE.md at the repo root.

export {};
