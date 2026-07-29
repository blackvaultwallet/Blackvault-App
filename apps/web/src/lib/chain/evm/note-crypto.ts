// Encrypted transfer notes for stealth payments (ERC-5564).
//
// A stealth transfer has nowhere to put a message: ERC-20/native transfers have
// no memo field, and anything written in the clear would undo the privacy. But
// `announce()` already carries a `metadata` blob — today just one byte (the view
// tag) — and the scanner reads only that first byte, so we can append to it
// without breaking anything already on-chain.
//
// Scheme: ECIES over secp256k1. The sender makes a throwaway keypair, does ECDH
// against the recipient's VIEWING public key (published in their meta-address),
// derives an AES-GCM key via HKDF, and appends
//   [version:1][ephemeral pubkey:33][iv:12][ciphertext+tag]
// after the view tag. Only the holder of the viewing private key can read it —
// the same key that already finds the payment, so no new secret to manage.
//
// The plaintext is padded to a fixed size so the ciphertext length never leaks
// how long the message was.

import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes, type Hex } from "viem";

const VERSION = 0x01;
const PUBKEY_BYTES = 33; // compressed secp256k1 point
const IV_BYTES = 12; // AES-GCM nonce
const GCM_TAG_BYTES = 16;
/** Fixed plaintext size: 1 length byte + up to 127 UTF-8 bytes of message. */
const PLAINTEXT_BYTES = 128;
const MAX_BODY_BYTES = PLAINTEXT_BYTES - 1;

const HKDF_INFO = new TextEncoder().encode("blackvault/stealth-note/v1");
const OFFSET_VERSION = 1; // byte 0 is the view tag
const OFFSET_PUBKEY = OFFSET_VERSION + 1;
const OFFSET_IV = OFFSET_PUBKEY + PUBKEY_BYTES;
const OFFSET_CIPHERTEXT = OFFSET_IV + IV_BYTES;
const MIN_METADATA_BYTES = OFFSET_CIPHERTEXT + PLAINTEXT_BYTES + GCM_TAG_BYTES;

/**
 * Viewing public key out of a `st:eth:…` meta-address. Scheme 1 packs two
 * compressed keys: spending first, viewing second.
 */
export function viewingPubKeyFromUri(uri: string): Hex {
  const raw = uri.trim().replace(/^st:eth:/i, "");
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (hex.length !== 132 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Unrecognized stealth meta-address");
  }
  return `0x${hex.slice(66)}` as Hex;
}

// ECDH → AES-GCM key. Both sides reach the same secret: the sender from its
// throwaway private key + the recipient's viewing public key, the recipient
// from its viewing private key + the published throwaway public key.
async function deriveAesKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Promise<CryptoKey> {
  // Compressed shared point; byte 0 is the parity prefix, so the x-coordinate
  // (the actual shared secret) is the remaining 32 bytes.
  const shared = secp256k1.getSharedSecret(privateKey, publicKey, true).slice(1);
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Cutting UTF-8 at a fixed byte count can split a multi-byte character; step
// back over continuation bytes (0b10xxxxxx) so we never emit a broken one.
function encodeBody(note: string): Uint8Array {
  const bytes = new TextEncoder().encode(note);
  if (bytes.length <= MAX_BODY_BYTES) return bytes;
  let end = MAX_BODY_BYTES;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
}

/**
 * Encrypt `note` to the recipient's viewing key and return the bytes to append
 * after the view tag. Throws on a malformed meta-address — callers must treat a
 * note failure as non-fatal and send without one.
 */
export async function encryptNote(note: string, recipientUri: string): Promise<Hex> {
  const viewingPubKey = hexToBytes(viewingPubKeyFromUri(recipientUri));
  const ephemeralPriv = secp256k1.utils.randomPrivateKey();
  const ephemeralPub = secp256k1.getPublicKey(ephemeralPriv, true);
  const key = await deriveAesKey(ephemeralPriv, viewingPubKey);

  // Fixed-size, zero-padded plaintext → the ciphertext says nothing about length.
  const body = encodeBody(note);
  const plaintext = new Uint8Array(PLAINTEXT_BYTES);
  plaintext[0] = body.length;
  plaintext.set(body, 1);

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );

  const out = new Uint8Array(1 + PUBKEY_BYTES + IV_BYTES + ciphertext.length);
  out[0] = VERSION;
  out.set(ephemeralPub, 1);
  out.set(iv, 1 + PUBKEY_BYTES);
  out.set(ciphertext, 1 + PUBKEY_BYTES + IV_BYTES);
  return bytesToHex(out);
}

/**
 * Read a note out of an announcement's metadata, or undefined when there isn't
 * one (legacy view-tag-only announcements, a different version, or anything
 * that fails to authenticate). Never throws — a bad note must not break a scan.
 */
export async function decryptNote(
  metadata: Hex,
  viewingPrivateKey: Hex
): Promise<string | undefined> {
  try {
    const bytes = hexToBytes(metadata);
    if (bytes.length < MIN_METADATA_BYTES) return undefined;
    if (bytes[OFFSET_VERSION] !== VERSION) return undefined;

    const key = await deriveAesKey(
      hexToBytes(viewingPrivateKey),
      bytes.slice(OFFSET_PUBKEY, OFFSET_PUBKEY + PUBKEY_BYTES)
    );
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(OFFSET_IV, OFFSET_CIPHERTEXT) },
        key,
        bytes.slice(OFFSET_CIPHERTEXT)
      )
    );
    const len = plaintext[0];
    if (len === 0 || len > MAX_BODY_BYTES) return undefined;
    return new TextDecoder().decode(plaintext.subarray(1, 1 + len)) || undefined;
  } catch {
    return undefined; // not ours, corrupt, or truncated
  }
}
