import { describe, expect, it } from "vitest";
import { NOTE_MAX, cleanNote } from "./note";

describe("cleanNote", () => {
  it("keeps a normal note", () => {
    expect(cleanNote("rent for July")).toBe("rent for July");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanNote("  paid back  ")).toBe("paid back");
  });

  it("treats blank/undefined as absent so no row is written", () => {
    expect(cleanNote("")).toBeUndefined();
    expect(cleanNote("   ")).toBeUndefined();
    expect(cleanNote(undefined)).toBeUndefined();
  });

  it("caps long notes at NOTE_MAX", () => {
    const long = "x".repeat(NOTE_MAX + 40);
    expect(cleanNote(long)).toHaveLength(NOTE_MAX);
  });
});
