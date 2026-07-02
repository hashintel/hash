/**
 * LabelCharacterSet tests: the reference-stability contract deck's font-atlas
 * manager depends on (same array unless the union grew), and seed coverage
 * for the characters our own label builders synthesise.
 */
import { describe, expect, it } from "vitest";

import { LabelCharacterSet } from "./label-character-set";

describe("LabelCharacterSet", () => {
  it("seeds printable ASCII and the synthesised label characters", () => {
    const characters = new LabelCharacterSet().characters;

    // ASCII bounds plus a mid-range spot check.
    expect(characters).toContain(" ");
    expect(characters).toContain("~");
    expect(characters).toContain("A");
    // Worker-side label builders emit these outside ASCII.
    expect(characters).toContain("…");
    expect(characters).toContain("→");
    expect(characters).toContain("←");
  });

  it("keeps the array reference when no new characters appear", () => {
    const set = new LabelCharacterSet();
    const before = set.characters;

    const after = set.extend(["Widget (42)", "→ Material", "1.2k…"]);

    expect(after).toBe(before);
  });

  it("grows once for new characters, then stabilises on the grown array", () => {
    const set = new LabelCharacterSet();
    const seed = set.characters;

    const grown = set.extend(["Straße", "数量"]);
    expect(grown).not.toBe(seed);
    expect(grown).toContain("ß");
    expect(grown).toContain("数");
    expect(grown).toContain("量");

    // Same characters again: the grown reference must hold.
    expect(set.extend(["Straße 数"])).toBe(grown);
  });

  it("treats astral code points as single characters", () => {
    const set = new LabelCharacterSet();

    const grown = set.extend(["📦 crate"]);

    expect(grown).toContain("📦");
  });

  it("never admits newlines (line breaks, not glyphs)", () => {
    const set = new LabelCharacterSet();
    const before = set.characters;

    const after = set.extend(["Type A\n(12)"]);

    expect(after).toBe(before);
    expect(after).not.toContain("\n");
  });
});
