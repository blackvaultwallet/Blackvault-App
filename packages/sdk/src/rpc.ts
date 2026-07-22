import { Connection, clusterApiUrl } from "@solana/web3.js";

// Defaults to devnet; pass a Helius endpoint for production.
export function createConnection(endpoint?: string): Connection {
  return new Connection(endpoint ?? clusterApiUrl("devnet"), "confirmed");
}
