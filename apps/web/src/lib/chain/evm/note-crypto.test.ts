import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, type Hex } from "viem";
import { decryptNote, encryptNote, viewingPubKeyFromUri } from "./note-crypto";

// A stealth meta-address is spending pubkey ++ viewing pubkey (compressed).
function makeIdentity() {
  const spendPriv = secp256k1.utils.randomPrivateKey();
  const viewPriv = secp256k1.utils.randomPrivateKey();
  const spendPub = bytesToHex(secp256k1.getPublicKey(spendPriv, true));
  const viewPub = bytesToHex(secp256k1.getPublicKey(viewPriv, true));
  return {
    uri: `st:eth:${spendPub}${viewPub.slice(2)}`,
    viewingPrivateKey: bytesToHex(viewPriv) as Hex,
    viewingPublicKey: viewPub,
  };
}

// The view tag occupies byte 0 in real announcements; encryptNote returns only
// what follows it, so prepend a byte to build the metadata the scanner sees.
const asMetadata = (suffix: Hex): Hex => `0x2a${suffix.slice(2)}` as Hex;

describe("viewingPubKeyFromUri", () => {
  it("takes the second key of the meta-address", () => {
    const id = makeIdentity();
    expect(viewingPubKeyFromUri(id.uri)).toBe(id.viewingPublicKey);
  });

  it("rejects a malformed meta-address", () => {
    expect(() => viewingPubKeyFromUri("st:eth:0xdeadbeef")).toThrow();
  });
});

describe("note round-trip", () => {
  it("the recipient's viewing key recovers the message", async () => {
    const id = makeIdentity();
    const meta = asMetadata(await encryptNote("rent for July", id.uri));
    expect(await decryptNote(meta, id.viewingPrivateKey)).toBe("rent for July");
  });

  it("survives multi-byte characters", async () => {
    const id = makeIdentity();
    const msg = "terima kasih 🙏 — sampai jumpa";
    const meta = asMetadata(await encryptNote(msg, id.uri));
    expect(await decryptNote(meta, id.viewingPrivateKey)).toBe(msg);
  });

  it("hides length: every note produces the same ciphertext size", async () => {
    const id = makeIdentity();
    const short = await encryptNote("hi", id.uri);
    const long = await encryptNote("x".repeat(120), id.uri);
    expect(short.length).toBe(long.length);
  });

  it("is unreadable with the wrong viewing key", async () => {
    const id = makeIdentity();
    const stranger = makeIdentity();
    const meta = asMetadata(await encryptNote("secret", id.uri));
    expect(await decryptNote(meta, stranger.viewingPrivateKey)).toBeUndefined();
  });
});

describe("decryptNote tolerates announcements without a note", () => {
  it("returns undefined for a legacy view-tag-only metadata", async () => {
    const id = makeIdentity();
    expect(await decryptNote("0x2a", id.viewingPrivateKey)).toBeUndefined();
  });

  it("returns undefined for garbage instead of throwing", async () => {
    const id = makeIdentity();
    const junk = ("0x2a01" + "ab".repeat(200)) as Hex;
    expect(await decryptNote(junk, id.viewingPrivateKey)).toBeUndefined();
  });
});
