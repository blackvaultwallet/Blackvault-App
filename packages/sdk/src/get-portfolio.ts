import { Connection } from "@solana/web3.js";
import { fetchSolBalance, fetchTokenBalances } from "./balances";
import {
  aggregatePortfolio,
  type AccountSnapshot,
  type Portfolio,
} from "./portfolio";

// Fetches balances across sub-accounts and aggregates client-side —
// the total never exists as a single number on-chain.
export async function getPortfolio(
  connection: Connection,
  addresses: string[]
): Promise<Portfolio> {
  const snapshots: AccountSnapshot[] = await Promise.all(
    addresses.map(async (address) => ({
      address,
      sol: await fetchSolBalance(connection, address),
      tokens: await fetchTokenBalances(connection, address),
    }))
  );

  return aggregatePortfolio(snapshots);
}
