import { describe, expect, it } from "vitest";

import { hashIconCatalog, hashIconStudies } from "./catalog";
import { descriptions } from "./catalog/descriptions";
import { hashIconNames } from "./hash-icon";

const entries = new Map(hashIconCatalog.map((entry) => [entry.name, entry]));

describe("icon catalog metadata", () => {
  it("describes every canonical icon once without reusing a study summary", () => {
    expect(hashIconCatalog.map(({ name }) => name)).toEqual(hashIconNames);
    expect(Object.keys(descriptions).sort()).toEqual([...hashIconNames].sort());
    expect(
      new Set(hashIconCatalog.map(({ description }) => description)).size,
    ).toBe(hashIconNames.length);
    for (const { description } of hashIconCatalog) {
      expect(description.trim().length).toBeGreaterThan(0);
      expect(
        hashIconStudies.some((study) => study.motion === description),
      ).toBe(false);
    }
  });

  it("distinguishes the cube from the subnet network in the same study", () => {
    expect(entries.get("cube")?.description).toMatch(/cube.*turns in depth/i);
    expect(entries.get("subnetNetwork")?.description).toMatch(
      /places connected to a transition/i,
    );
    expect(entries.get("subnetNetwork")?.description).not.toMatch(
      /cube|quarter-turn/i,
    );
  });

  it("links related canonical icons in both directions without aliases, duplicates, or self-links", () => {
    for (const { name, related } of hashIconCatalog) {
      expect(new Set(related).size).toBe(related.length);
      expect(related).not.toContain(name);
      expect(related).toEqual(
        hashIconNames.filter((candidate) => related.includes(candidate)),
      );
      for (const candidate of related) {
        expect(entries.has(candidate)).toBe(true);
        expect(entries.get(candidate)?.related).toContain(name);
      }
    }
  });

  it.each([
    ["place", "addPlace"],
    ["transition", "addTransition"],
    ["eye", "eyeSlash"],
    ["user", "userPlus"],
    ["lockOpen", "lockClosed"],
    ["file", "fileSpreadsheet"],
    ["search", "zoomIn"],
    ["play", "pause"],
    ["clockRotateLeft", "reset"],
  ] as const)("links %s to %s beyond the original studies", (name, related) => {
    expect(entries.get(name)?.related).toContain(related);
  });

  it.each([
    ["sortDown", "sortUp"],
    ["sortDownAlphabetical", "sortUpAlphabetical"],
    ["sortDownNumeric", "sortUpNumeric"],
    ["sortDownShapes", "sortUpShapes"],
    ["sortDownSize", "sortUpSize"],
  ] as const)(
    "groups %s and %s under Editing with a related counterpart",
    (down, up) => {
      expect(entries.get(down)?.category).toBe("Editing");
      expect(entries.get(up)?.category).toBe("Editing");
      expect(entries.get(down)?.related).toContain(up);
      expect(entries.get(up)?.related).toContain(down);
    },
  );

  it("keeps study alternatives related without treating an entire category as related", () => {
    for (const { names } of hashIconStudies) {
      for (const name of names) {
        expect(entries.get(name)?.related).toEqual(
          expect.arrayContaining(
            names.filter((candidate) => candidate !== name),
          ),
        );
      }
    }
    expect(entries.get("place")?.related).not.toContain("clock");
    expect(entries.get("truck")?.related).toEqual([]);
  });
});
