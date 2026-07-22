"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useWallets,
  useSignMessage,
  useSignTransaction,
  useSignAndSendTransaction,
} from "@privy-io/react-auth/solana";
import {
  getBase58Decoder,
  compileTransaction,
  getTransactionEncoder,
} from "@solana/kit";

const DEVNET_CHAIN = "solana:devnet" as const;

/** Compile a kit transaction message, encode to wire bytes, sign and send via Privy. */
export async function sendKitTxMessage(
  vw: { signAndSend: (tx: Uint8Array) => Promise<string> },
  txMessage: Parameters<typeof compileTransaction>[0]
): Promise<string> {
  const compiled = compileTransaction(txMessage);
  const wire = new Uint8Array(getTransactionEncoder().encode(compiled));
  return vw.signAndSend(wire);
}

/** Unified signer facade — features depend on this, not on Privy directly. */
export function useVaultWallet() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const wallet = wallets?.[0];
  const address = wallet?.address;

  return {
    ready,
    isConnected: Boolean(authenticated && address),
    address,
    wallet,
    login,
    logout,
    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      if (!wallet) throw new Error("Wallet not ready");
      const res = await signMessage({ message, wallet });
      return res.signature;
    },
    signTransaction: async (transaction: Uint8Array): Promise<Uint8Array> => {
      if (!wallet) throw new Error("Wallet not ready");
      const res = await signTransaction({
        transaction,
        wallet,
        chain: DEVNET_CHAIN,
      });
      return res.signedTransaction;
    },
    signAndSend: async (transaction: Uint8Array): Promise<string> => {
      if (!wallet) throw new Error("Wallet not ready");
      const res = await signAndSendTransaction({
        transaction,
        wallet,
        chain: DEVNET_CHAIN,
      });
      return getBase58Decoder().decode(res.signature);
    },
  };
}

export type VaultWallet = ReturnType<typeof useVaultWallet>;
