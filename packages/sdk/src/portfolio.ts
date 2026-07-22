export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
}

export interface AccountSnapshot {
  address: string;
  sol: number;
  tokens: TokenBalance[];
}

export interface Portfolio {
  totalSol: number;
  tokens: TokenBalance[];
  accountCount: number;
}

export function aggregatePortfolio(accounts: AccountSnapshot[]): Portfolio {
  const totalSol = accounts.reduce((sum, a) => sum + a.sol, 0);
  const tokenMap = new Map<string, TokenBalance>();

  for (const acc of accounts) {
    for (const t of acc.tokens) {
      const existing = tokenMap.get(t.mint);
      if (existing) {
        existing.amount += t.amount;
      } else {
        tokenMap.set(t.mint, { ...t });
      }
    }
  }

  return {
    totalSol,
    tokens: [...tokenMap.values()],
    accountCount: accounts.length,
  };
}
