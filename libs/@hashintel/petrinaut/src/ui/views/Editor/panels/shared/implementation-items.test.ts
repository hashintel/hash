import { describe, expect, it } from "vitest";

import { implementationItems } from "./implementation-items";

import type { Component, ResolvedLibraries } from "@hashintel/petrinaut-core";

const component = (
  id: string,
  name: string,
  overrides: Partial<Component> = {},
): Component => ({
  id,
  name,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const stage = component("stage", "Stage", { interface: true });
const fast = component("fast", "Fast", { implements: ["stage"] });
const slow = component("slow", "Slow", { implements: ["stage"] });
const unrelated = component("unrelated", "Unrelated");
const sdcpn = { components: [stage, fast, slow, unrelated] };

const libraries: ResolvedLibraries = new Map([
  [
    "logistics",
    {
      id: "logistics",
      name: "Logistics",
      components: [component("quick", "Quick")],
    },
  ],
]);

const texts = (items: ReturnType<typeof implementationItems>) =>
  items.map(({ text }) => text);

describe("implementationItems", () => {
  it("lists the document's implementations, then a library's under its name", () => {
    const items = implementationItems(
      sdcpn,
      { id: "stage" },
      undefined,
      libraries,
    );

    expect(texts(items)).toEqual(["Fast", "Slow", "Quick, from Logistics"]);
    expect(items.map(({ reference }) => reference)).toEqual([
      { id: "fast" },
      { id: "slow" },
      { from: "logistics", id: "quick" },
    ]);
    expect(new Set(items.map(({ value }) => value)).size).toBe(3);
  });

  it("leaves out what `accepts` turns down", () => {
    expect(
      texts(
        implementationItems(
          sdcpn,
          { id: "stage" },
          undefined,
          libraries,
          ({ id }) => id !== "slow",
        ),
      ),
    ).toEqual(["Fast", "Quick, from Logistics"]);
  });

  it("keeps the chosen component listed when it is no implementation or is turned down", () => {
    expect(
      texts(implementationItems(sdcpn, { id: "stage" }, { id: "unrelated" })),
    ).toEqual(["Fast", "Slow", "Unrelated"]);
    expect(
      texts(
        implementationItems(
          sdcpn,
          { id: "stage" },
          { id: "slow" },
          undefined,
          ({ id }) => id !== "slow",
        ),
      ),
    ).toEqual(["Fast", "Slow"]);
  });

  it("names a chosen component that does not resolve, and its import by id", () => {
    expect(
      texts(
        implementationItems(
          sdcpn,
          { id: "stage" },
          { from: "missing", id: "gone" },
          libraries,
        ),
      ).at(-1),
    ).toBe("Unknown component, from missing");
  });
});
