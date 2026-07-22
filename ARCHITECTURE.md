# BlackVault — Architecture & Mechanisms

How the production system works, end to end. Implementations of the flows
below are redacted in this release; every stub file points back here.

## 1. Stealth transfers (ERC-5564, recipient privacy)

```
sender                          chain                        recipient
──────                          ─────                        ─────────
                                             enable: sign once → derive
                                             stealth identity (spending +
                                             viewing keypairs). Keys are
                                             session-only, never stored.
paste st:eth:… meta-address
compute one-time address P
  (ECDH: ephemeral key × recipient
   viewing pub, tweak spending pub)
announce(ephemeralPub, P) ──► ERC-5564 Announcer (canonical singleton)
transfer funds ──────────────► P (a fresh address, no history)
                                             scan announcer logs with the
                                             viewing key → detect P is mine
                                             derive P's private key → claim
                                             (sweep to wallet; ERC-20 claims
                                              get just-in-time gas funding)
```

Safety order matters: the announcement is verified before funds move, and
every step checks the tx receipt, so a failed announce can never strand money
at an unrecoverable address. Balances at stealth addresses roll up into the
"private balance" the owner sees; on-chain there is no link between sender,
recipient, and the one-time addresses.

Scanning is chunked over block ranges with resumable cursors persisted
per-address (public data only — never key material).

## 2. BlackVault Names (self-hosted ENS subnames)

Claim flow (optionally paid):

```
app: check availability → (paid mode) transfer N USDG → revenue wallet
     → POST claim { name, address, txHash }
server: fetch receipt on-chain → find ERC-20 Transfer log
        (token = canonical USDG, from = claimer, to = revenue, value ≥ price)
        → INSERT tx hash into a payments table (PRIMARY KEY = replay-proof)
        → release claimer's previous name → record new name
        (single DB transaction: payment burn + rename are atomic)
```

Resolution paths:
- **In-app**: `/api/names/resolve` maps `label.parent` → address.
- **Everywhere else (ENS-native)**: an ENSIP-10 offchain resolver on Ethereum
  reverts with `OffchainLookup` → the CCIP-Read gateway answers with the
  record **signed** as `keccak(0x1900 ‖ resolver ‖ expiry ‖ hash(callData) ‖
  hash(result))` → `resolveWithProof` verifies the signature against an
  allowlisted signer before returning. Verified end-to-end on Sepolia.

## 3. IP-privacy proxy pattern

The browser only ever talks to the app's own origin. Server routes relay to:
RPC (chain reads/writes), ENS RPC, price quotes + history, RSS news,
thumbnails (with DNS-resolved private-range SSRF blocking), X oEmbed, and
trending-pool data. Effect: no RPC provider, price API, or CDN can correlate
a user's IP with the addresses or headlines they query. Responses are cached
server-side and shared across users (one upstream call per window), with
last-good stale fallbacks so upstream throttling never blanks the UI.

`eth_getLogs` is special-cased: the proxy routes it to a wide-range logs
endpoint while all other methods hit the primary provider — wide scanning
windows without the primary provider's log-range cap.

## 4. Consent & gas preflight

Nothing signs silently: public sends go through a review stage (resolved
ENS target shown) and a slide-to-confirm; private sends use the same slide
gate in a full-screen flow. Every value-moving path first checks that the
wallet holds ETH for fees and refuses early with a clear message (a gasless
wallet can otherwise never build a tx). Native-token sends refuse to sweep
the full balance so the fee always remains payable.

## 5. Biometric app lock

A dedicated WebAuthn **platform** credential (Face ID / fingerprint /
Windows Hello) is created on enroll — separate from any signing key. The
app gates on `navigator.credentials.get` with `userVerification: required`
at: app open (per page load), first entry to the Private Vault, key export,
and disabling the lock itself. The lock protects the UI; custody remains
with the embedded-wallet session. Login stays Google/email so accounts
remain switchable.

## 6. Rate limiting & abuse control

Per-IP sliding windows (Upstash Redis) on every abuse-prone route: the AI
endpoint (paid model), the RPC relays, name claims (anti-squatting), and the
image proxy (bandwidth). The limiter is fail-open: a Redis outage degrades to
unlimited rather than taking the wallet down. Payment replay is impossible at
the DB layer (unique tx hash), independent of rate limits.

## 7. Activity journal

On-chain logs only show raw transfers, so the app records semantic events at
action time (bought a name, paid a QR, created a payment request…) in a
per-address local journal. The Activity feed merges journal + on-chain
transfers + the private log, deduplicates raw transfers already covered by a
journal entry (by tx hash), and keeps private entries device-local.

## 8. Chain configuration

Robinhood Chain (Arbitrum Orbit, chainId 4663). Primary RPC full-featured;
logs endpoint wide-range; canonical contracts only (ERC-5564 announcer /
ERC-6538 registry singletons, Paxos USDG). Assets with no canonical
deployment on the active network are filtered out of the UI automatically.
The chain layer is `defineChain` + adapter-based — additional EVM networks
(Ethereum, Arbitrum, Base, Optimism) are staged in the UI as "Soon".
