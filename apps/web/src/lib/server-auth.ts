import "server-only";

// Server-side identity for API routes.
//
// Until now every route trusted whatever the client sent. That was survivable
// while routes only read public data; it stops being survivable the moment a
// route can return a card number or move money. So: the client sends its Privy
// access token, we verify it against Privy, and the route learns which wallet
// is calling from a source the caller cannot forge.
//
// Deliberately returns the wallet address, not the Privy user id — everything
// downstream (balances, stealth keys, card ownership) is keyed by address.

import { PrivyClient } from "@privy-io/server-auth";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const APP_SECRET = process.env.PRIVY_APP_SECRET;

let client: PrivyClient | null = null;
function privy(): PrivyClient {
  if (!APP_ID || !APP_SECRET) {
    throw new Error("Privy server auth is not configured");
  }
  client ??= new PrivyClient(APP_ID, APP_SECRET);
  return client;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** `Authorization: Bearer <privy access token>` */
function bearer(req: Request): string {
  const raw = req.headers.get("authorization") ?? "";
  const [scheme, token] = raw.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("Missing bearer token");
  }
  return token;
}

/**
 * Verifies the caller and returns their embedded wallet address, lowercased.
 *
 * Throws AuthError on anything suspect — the caller should turn that into a 401
 * and nothing else. Never fall back to an address supplied in the request body:
 * that is exactly the hole this closes.
 */
export async function requireWallet(req: Request): Promise<string> {
  const token = bearer(req);

  let userId: string;
  try {
    ({ userId } = await privy().verifyAuthToken(token));
  } catch {
    throw new AuthError("Invalid or expired session");
  }

  const user = await privy().getUser(userId);
  // Prefer the embedded wallet; a user can also link external ones, and those
  // are not the account the app provisions and transacts from.
  const accounts = user.linkedAccounts ?? [];
  const wallet =
    accounts.find(
      (a): a is typeof a & { address: string } =>
        a.type === "wallet" &&
        (a as { walletClientType?: string }).walletClientType === "privy" &&
        typeof (a as { address?: string }).address === "string"
    ) ??
    accounts.find(
      (a): a is typeof a & { address: string } =>
        a.type === "wallet" && typeof (a as { address?: string }).address === "string"
    );

  if (!wallet) throw new AuthError("No wallet on this account");
  return wallet.address.toLowerCase();
}

/** Turns an AuthError into a 401 and anything else into a 500. */
export function authErrorResponse(e: unknown): Response {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: 401 });
  }
  return Response.json({ error: "Server error" }, { status: 500 });
}
