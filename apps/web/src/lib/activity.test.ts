import { describe, it, expect, beforeEach, vi } from "vitest";
import { readActivity, recordActivity, activityLabel } from "./activity";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const ADDR = "Abc123";

describe("activity log", () => {
  beforeEach(() => store.clear());

  it("records newest first", () => {
    recordActivity(ADDR, { ts: 1, type: "deposit", amountSol: 0.1 });
    recordActivity(ADDR, { ts: 2, type: "private-send", amountSol: 0.05 });
    const list = readActivity(ADDR);
    expect(list).toHaveLength(2);
    expect(list[0].type).toBe("private-send");
  });

  it("caps at 50 entries", () => {
    for (let i = 0; i < 60; i++) {
      recordActivity(ADDR, { ts: i, type: "deposit" });
    }
    expect(readActivity(ADDR)).toHaveLength(50);
  });

  it("returns empty on missing/corrupt data", () => {
    expect(readActivity("nobody")).toEqual([]);
    store.set("bv_activity_bad", "{not json");
    expect(readActivity("bad")).toEqual([]);
  });

  it("labels all types", () => {
    expect(activityLabel("deposit")).toMatch(/deposit/i);
    expect(activityLabel("private-receive")).toMatch(/receive/i);
  });
});
