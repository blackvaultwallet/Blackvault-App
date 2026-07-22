// apps/web/src/app/api/rpc/evm/route.ts
//
// [ REDACTED - source-available release ]
//
// Mechanism: Same-origin JSON-RPC proxy: the browser never talks to an RPC provider, so no provider can correlate user IPs with queried addresses. eth_getLogs is rerouted to a wide-range logs endpoint; all other calls to the primary provider. Per-IP rate limited.
//
// The full implementation lives in the private deployment repository.
// End-to-end flows are documented in ARCHITECTURE.md at the repo root.

export {};
