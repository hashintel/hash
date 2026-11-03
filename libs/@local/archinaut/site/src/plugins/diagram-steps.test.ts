import { fromHtml } from "hast-util-from-html";
import { describe, expect, it } from "vitest";

import { partIdOf, partSteps, wrapDiagramParts } from "./diagram-steps";

import type { Element } from "hast";

const base64 = (id: string) => Buffer.from(id).toString("base64");

describe("partIdOf", () => {
  it("decodes a shape's and a connection's id, escapes undone", () => {
    expect(partIdOf(base64("core"))).toBe("core");
    expect(partIdOf(base64("(react -&gt; core)[0]"))).toBe(
      "(react -> core)[0]",
    );
    expect(partIdOf("shape")).toBeNull();
  });
});

describe("partSteps", () => {
  const steps = (parts: Record<string, string[]>) =>
    Object.fromEntries(partSteps(new Map(Object.entries(parts))));

  it("brings a connection in with its later end", () => {
    expect(
      steps({
        core: [],
        react: ["react", "at-1"],
        ui: ["at-2"],
        "(react -> core)[0]": [],
        "(ui -> react)[0]": [],
        "(ui -> core)[0]": ["at-3"],
      }),
    ).toEqual({
      core: { at: 0, until: null },
      react: { at: 1, until: null },
      ui: { at: 2, until: null },
      "(react -> core)[0]": { at: 1, until: null },
      "(ui -> react)[0]": { at: 2, until: null },
      "(ui -> core)[0]": { at: 3, until: null },
    });
  });

  it("hides a connection with its end, and a shape with its container", () => {
    expect(
      steps({
        old: ["until-2"],
        new: [],
        "(old -> new)[0]": [],
        group: ["at-1"],
        "group.inner": [],
        "group.(inner -> peer)[0]": [],
        "group.peer": ["until-3"],
      }),
    ).toMatchObject({
      "(old -> new)[0]": { at: 0, until: 2 },
      "group.inner": { at: 1, until: null },
      "group.(inner -> peer)[0]": { at: 1, until: 3 },
    });
  });
});

describe("wrapDiagramParts", () => {
  it("wraps the drawing's stepped parts in RevealGroup and leaves the rest", () => {
    const [svg] = fromHtml(
      `<svg><svg class="d2-1 d2-svg"><rect/><g class="${base64("core")} core"><g class="shape"/></g><g class="${base64("ui")} ui at-2"><g class="shape"/></g><g class="${base64("(ui -&gt; core)[0]")}"><marker id="arrow"/><path/></g></svg></svg>`,
      { space: "svg", fragment: true },
    ).children as Element[];
    wrapDiagramParts(svg!);
    const drawing = svg!.children[0] as Element;
    expect(
      drawing.children.map((child) =>
        "name" in child && child.name === "RevealGroup"
          ? `RevealGroup at=${(child.attributes as { value: { value: string } }[])[0]?.value.value}`
          : child.type === "element"
            ? child.tagName
            : child.type,
      ),
    ).toEqual(["defs", "rect", "g", "RevealGroup at=2", "RevealGroup at=2"]);
    expect(
      (drawing.children[0] as Element).children.map(
        (child) => (child as Element).properties.id,
      ),
    ).toEqual(["arrow"]);
  });

  it("refuses a class list written with commas", () => {
    const [svg] = fromHtml(
      `<svg><svg><g class="${base64("ui")} ui, at-2"/></svg></svg>`,
      { space: "svg", fragment: true },
    ).children as Element[];
    expect(() => wrapDiagramParts(svg!)).toThrow(/\[react; at-1\]/u);
  });
});
