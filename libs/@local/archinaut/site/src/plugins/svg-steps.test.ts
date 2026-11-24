import { fromHtml } from "hast-util-from-html";
import { describe, expect, it } from "vitest";

import { planOf, wrapSteppedParts } from "./svg-steps";

import type { Element, ElementContent } from "hast";

const svgOf = (markup: string) =>
  (
    fromHtml(markup, { space: "svg", fragment: true }).children as Element[]
  )[0]!;

/** Each child as its tag, or as the part it became with its attributes. */
const shape = (nodes: ElementContent[]): string[] =>
  nodes.map((node) => {
    if ("name" in node && node.name === "DiagramPart") {
      const attributes = (
        node.attributes as { name: string; value: string | { value: string } }[]
      ).map(
        ({ name, value }) =>
          `${name}=${typeof value === "string" ? value : value.value}`,
      );
      return `DiagramPart ${attributes.join(" ")}`;
    }
    return node.type === "element"
      ? `${node.tagName}${Array.isArray(node.properties.className) ? `.${node.properties.className.join(".")}` : ""}`
      : node.type;
  });

describe("planOf", () => {
  it("reads states and events from the class names", () => {
    expect(
      planOf([
        "bar",
        "at-1",
        "at-2",
        "until-5",
        "draw-3",
        "flow-3",
        "flow-4",
        "focus-2",
        "token-6",
      ]),
    ).toEqual({
      at: 2,
      until: 5,
      draw: 3,
      flow: [3, 4],
      focus: [2],
      token: [6],
    });
    expect(planOf(["bar", "at-x"])).toBeNull();
  });
});

describe("wrapSteppedParts", () => {
  it("wraps stepped elements and marks their drawn siblings as parts", () => {
    const svg = svgOf(
      `<svg><style>x</style><rect class="axis"/><path class="curve draw-1 focus-3" d="M 0 0 L 10 0"/><g class="limit at-2"><line/></g></svg>`,
    );
    expect(wrapSteppedParts(svg)).toBe(true);
    expect(shape(svg.children)).toEqual([
      "style",
      "rect.axis.deck-part",
      "DiagramPart draw=1 focus=[3]",
      "DiagramPart at=2",
    ]);
  });

  it("sends a token along the part's first path", () => {
    const svg = svgOf(
      `<svg><g class="arc token-2"><path d="M 1 2 L 3 4"/></g></svg>`,
    );
    wrapSteppedParts(svg);
    expect(shape(svg.children)).toEqual([
      "DiagramPart tokens=[2] path=M 1 2 L 3 4",
    ]);
  });

  it("wraps nested parts innermost first, and leaves a drawing without steps alone", () => {
    const nested = svgOf(
      `<svg><g class="at-1"><circle class="at-2"/></g></svg>`,
    );
    wrapSteppedParts(nested);
    expect(shape(nested.children)).toEqual(["DiagramPart at=1"]);
    const [outer] = nested.children as unknown as { children: Element[] }[];
    expect(shape(outer!.children[0]!.children)).toEqual(["DiagramPart at=2"]);
    const plain = svgOf(`<svg><rect/></svg>`);
    expect(wrapSteppedParts(plain)).toBe(false);
    expect(shape(plain.children)).toEqual(["rect"]);
  });

  it("refuses a token on a part with no line to travel", () => {
    expect(() =>
      wrapSteppedParts(svgOf(`<svg><rect class="token-1"/></svg>`)),
    ).toThrow(/token-1 needs a line/u);
  });
});
