import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { TokenBalance } from "./portfolio";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export async function fetchSolBalance(
  connection: Connection,
  address: string
): Promise<number> {
  const lamports = await connection.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

export async function fetchTokenBalances(
  connection: Connection,
  address: string
): Promise<TokenBalance[]> {
  const resp = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(address),
    { programId: TOKEN_PROGRAM_ID }
  );

  return resp.value.map((acc) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (acc.account.data as any).parsed.info;
    return {
      mint: info.mint,
      amount: info.tokenAmount.uiAmount ?? 0,
      decimals: info.tokenAmount.decimals,
    };
  });
}
