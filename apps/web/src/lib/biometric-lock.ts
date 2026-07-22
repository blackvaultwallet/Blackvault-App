"use client";

// Bank-style app lock backed by the device's platform authenticator (WebAuthn:
// Face ID / fingerprint / Windows Hello). This gates the UI on open — the
// actual keys stay guarded by the Privy session; the lock stops casual access
// to an open wallet on a shared device.
//
// A dedicated device credential is created on enroll (independent of Privy's
// passkey), its id kept in localStorage; verify asks the authenticator for an
// assertion with user verification required.

const KEY = "bv_applock_v1";

interface Stored {
  credId: string; // base64url rawId
}

const b64 = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function lockSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export function lockEnabled(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export async function enrollLock(): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "BlackVault", id: location.hostname },
      user: { id: userId, name: "BlackVault user", displayName: "BlackVault" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric setup was cancelled");
  const stored: Stored = { credId: b64(cred.rawId) };
  localStorage.setItem(KEY, JSON.stringify(stored));
}

export async function verifyLock(): Promise<boolean> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return true;
  const { credId } = JSON.parse(raw) as Stored;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: "public-key", id: unb64(credId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function disableLock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
