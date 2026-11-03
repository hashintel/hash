import { fromHtml } from "hast-util-from-html";
import { describe, expect, it } from "vitest";

import { partIdOf, partSteps, prepareD2Parts } from "./d2-parts";

import type { Element, ElementContent } from "hast";

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

describe("prepareD2Parts", () => {
  const drawing = (inner: string) => {
    const [svg] = fromHtml(
      `<svg><svg class="d2-1 d2-svg">${inner}</svg></svg>`,
      {
        space: "svg",
        fragment: true,
      },
    ).children as Element[];
    return svg!;
  };
  const classes = (element: ElementContent | undefined) =>
    element?.type === "element" ? element.properties.className : undefined;

  it("gives each part the steps it inherits and moves the arrowheads up", () => {
    const svg = drawing(
      `<rect/><g class="${base64("core")} core"></g><g class="${base64("ui")} ui draw-2"></g><g class="${base64("(ui -&gt; core)[0]")} token-3"><marker id="arrow"/><path d="M 0 0 L 1 1"/></g>`,
    );
    prepareD2Parts(svg);
    const inner = svg.children[0] as Element;
    expect(inner.children.map((child) => (child as Element).tagName)).toEqual([
      "defs",
      "rect",
      "g",
      "g",
      "g",
    ]);
    expect(classes(inner.children[3])).toEqual([
      base64("ui"),
      "ui",
      "draw-2",
      "at-2",
    ]);
    expect(classes(inner.children[4])).toEqual([
      base64("(ui -&gt; core)[0]"),
      "token-3",
      "at-2",
    ]);
    expect(
      ((inner.children[0] as Element).children[0] as Element).properties.id,
    ).toBe("arrow");
  });

  it("chains the tokens of one step through the node they share", () => {
    const svg = drawing(
      [
        `<g class="${base64("(p1 -&gt; t1)[0]")} token-3"><path d="M 0 0"/></g>`,
        `<g class="${base64("(t1 -&gt; p2)[0]")} token-3 token-5"><path d="M 1 1"/></g>`,
        `<g class="${base64("(p2 -&gt; t2)[0]")} token-5"><path d="M 2 2"/></g>`,
      ].join(""),
    );
    prepareD2Parts(svg);
    const inner = svg.children[0] as Element;
    expect(
      inner.children.map((child) =>
        child.type === "element" ? child.properties.dataTokenTiming : undefined,
      ),
    ).toEqual(["3:0:1", "3:1:0 5:0:1", "5:1:0"]);
  });

  it("refuses a class list written with commas", () => {
    expect(() =>
      prepareD2Parts(drawing(`<g class="${base64("ui")} ui, at-2"/>`)),
    ).toThrow(/\[react; at-1\]/u);
  });
});
