import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { examplesRoot, listAllDecks, listDecks } from "./folders";

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "archinaut-decks-"));
  const deck = join(root, "tour");
  mkdirSync(deck);
  writeFileSync(
    join(deck, "deck.json"),
    JSON.stringify({ title: "Tour", description: "A walk" }),
  );
  for (const name of [
    "10-end.tsx",
    "2-middle.mdx",
    "1a-aside.tsx",
    "1-start.mdx",
    "notes.md",
    "data.ts",
  ]) {
    writeFileSync(join(deck, name), "");
  }
  mkdirSync(join(root, "empty"));
  return root;
};

describe("listDecks", () => {
  it("orders slides by their numeric prefix and skips other files", () => {
    const [deck] = listDecks(fixture());
    expect(deck?.slides.map((slide) => `${slide.id}:${slide.kind}`)).toEqual([
      "start:mdx",
      "aside:tsx",
      "middle:mdx",
      "end:tsx",
    ]);
  });

  it("reads the deck's metadata and drops folders without slides", () => {
    const decks = listDecks(fixture());
    expect(
      decks.map((deck) => [deck.id, deck.title, deck.description]),
    ).toEqual([["tour", "Tour", "A walk"]]);
  });

  it("shows the site's logo unless the deck names HASH's, another or none", () => {
    const root = fixture();
    const deck = join(root, "tour");
    const logoOf = (meta: Record<string, unknown>) => {
      writeFileSync(join(deck, "deck.json"), JSON.stringify(meta));
      return listDecks(root)[0]?.logo;
    };
    writeFileSync(join(deck, "partner.svg"), "<svg/>");
    expect(logoOf({})).toEqual({ kind: "site" });
    expect(logoOf({ logo: "hash" })).toEqual({ kind: "hash" });
    expect(logoOf({ logo: false })).toEqual({ kind: "none" });
    expect(logoOf({ logo: "partner.svg" })).toEqual({
      kind: "file",
      file: join(deck, "partner.svg"),
    });
    expect(() => logoOf({ logo: "missing.svg" })).toThrow(/"logo" must be/u);
    expect(() => logoOf({ logo: "../tour/partner.svg" })).not.toThrow();
    expect(() => logoOf({ logo: "../elsewhere.svg" })).toThrow(/"logo"/u);
    expect(() => logoOf({ logo: true })).toThrow(/"logo"/u);
  });

  it("has no decks without a slides directory", () => {
    expect(listDecks(null)).toEqual([]);
    expect(listDecks(join(tmpdir(), "archinaut-no-such-folder"))).toEqual([]);
  });
});

describe("listAllDecks", () => {
  it("lists the instance's decks, then the examples under prefixed ids", () => {
    const decks = listAllDecks(fixture());
    expect(decks[0]).toMatchObject({ id: "tour", origin: "instance" });
    const examples = decks.filter((deck) => deck.origin === "example");
    expect(examples.length).toBeGreaterThan(0);
    for (const deck of examples) {
      expect(deck.id).toMatch(/^example-/u);
      expect(deck.directory.startsWith(examplesRoot)).toBe(true);
    }
  });

  it("refuses an instance deck that takes an example's id", () => {
    const root = fixture();
    const [example] = listDecks(examplesRoot, "example");
    const clash = join(root, example?.id ?? "example-missing");
    mkdirSync(clash);
    writeFileSync(join(clash, "0-title.mdx"), "");
    expect(() => listAllDecks(root)).toThrow(/an example deck's id/u);
  });
});
