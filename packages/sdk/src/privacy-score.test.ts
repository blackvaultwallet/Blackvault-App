import { describe, it, expect } from "vitest";
import { privacyHealthScore } from "./privacy-score";

describe("privacyHealthScore", () => {
  it("low score with tips when all signals are bad", () => {
    const r = privacyHealthScore({
      accountCount: 1,
      usesStealth: false,
      usesConfidential: false,
    });
    expect(r.level).toBe("low");
    expect(r.score).toBeLessThan(40);
    expect(r.tips.length).toBeGreaterThan(0);
  });

  it("full score and no tips when all signals are good", () => {
    const r = privacyHealthScore({
      accountCount: 3,
      usesStealth: true,
      usesConfidential: true,
    });
    expect(r.level).toBe("high");
    expect(r.score).toBe(100);
    expect(r.tips).toEqual([]);
  });
});
