// Local shielded-activity log. Private actions are unreadable on-chain by
// design, so the only record lives on this device.

export type ActivityType =
  | "deposit"
  | "withdraw"
  | "private-send"
  | "private-receive";

export interface ActivityEntry {
  ts: number;
  type: ActivityType;
  amountSol?: number;
}

const CAP = 50;

const key = (address: string) => `bv_activity_${address}`;

export function readActivity(address: string): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(key(address));
    if (!raw) return [];
    const list = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordActivity(address: string, entry: ActivityEntry): void {
  try {
    const list = [entry, ...readActivity(address)].slice(0, CAP);
    localStorage.setItem(key(address), JSON.stringify(list));
  } catch {
    // storage unavailable
  }
}

export function activityLabel(type: ActivityType): string {
  switch (type) {
    case "deposit":
      return "Deposit to Private Balance";
    case "withdraw":
      return "Withdraw to public";
    case "private-send":
      return "Private send";
    case "private-receive":
      return "Private receive";
  }
}
