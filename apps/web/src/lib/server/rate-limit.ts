// apps/web/src/lib/server/rate-limit.ts
//
// [ REDACTED - source-available release ]
//
// Mechanism: Per-IP sliding-window rate limiting on Upstash Redis; no-op without env, fails open on Redis errors so an outage cannot take the wallet down.
//
// The full implementation lives in the private deployment repository.
// End-to-end flows are documented in ARCHITECTURE.md at the repo root.

export {};
