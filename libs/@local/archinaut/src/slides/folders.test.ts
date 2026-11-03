import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listDecks } from "./folders";

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

  it("has no decks without a slides directory", () => {
    expect(listDecks(null)).toEqual([]);
    expect(listDecks(join(tmpdir(), "archinaut-no-such-folder"))).toEqual([]);
  });
});
