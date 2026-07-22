export const BLACKVAULT_VERSION = "0.1.0";

export { createConnection } from "./rpc";
export { fetchSolBalance, fetchTokenBalances } from "./balances";
export { getPortfolio } from "./get-portfolio";
export {
  aggregatePortfolio,
  type Portfolio,
  type AccountSnapshot,
  type TokenBalance,
} from "./portfolio";
export {
  VAULT_KEEPER_SYSTEM,
  buildVaultKeeperContext,
  type PrivacyContext,
} from "./agent";
export {
  privacyHealthScore,
  type PrivacySignals,
  type PrivacyHealth,
  type PrivacyFactor,
} from "./privacy-score";
export { guardDeposit, guardWithdraw, type GuardResult } from "./privacy-guard";
