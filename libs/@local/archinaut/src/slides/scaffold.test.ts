import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scaffoldDeck } from "./scaffold";

const siteRoot = fileURLToPath(new URL("../../site", import.meta.url));

const slidesRoot = (): string =>
  join(mkdtempSync(join(tmpdir(), "archinaut-scaffold-")), "slides");

describe("scaffoldDeck", () => {
  it("creates the slides root, the deck and the tsconfig", async () => {
    const root = slidesRoot();
    const result = await scaffoldDeck({
      root,
      name: "first-talk",
      siteRoot,
    });
    expect(result).toEqual({
      directory: join(root, "first-talk"),
      wroteTsconfig: true,
    });
    expect(
      JSON.parse(readFileSync(join(root, "first-talk", "deck.json"), "utf8")),
    ).toEqual({
      title: "First talk",
      description: "",
    });
    expect(existsSync(join(root, "first-talk", "0-title.mdx"))).toBe(true);
  });

  it("keeps a tsconfig that is already there", async () => {
    const root = slidesRoot();
    await scaffoldDeck({ root, name: "one", siteRoot });
    writeFileSync(join(root, "tsconfig.json"), "{}\n");
    const result = await scaffoldDeck({ root, name: "two", siteRoot });
    expect(result.wroteTsconfig).toBe(false);
    expect(readFileSync(join(root, "tsconfig.json"), "utf8")).toBe("{}\n");
  });

  it("refuses a deck that exists", async () => {
    const root = slidesRoot();
    await scaffoldDeck({ root, name: "one", siteRoot });
    await expect(scaffoldDeck({ root, name: "one", siteRoot })).rejects.toThrow(
      "already exists",
    );
  });
});
