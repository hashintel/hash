import { describe, expect, it } from "vitest";

import { nodeFocusStyle } from "../../../styles/focus";
import {
  canvasColor,
  fadedCoverColor,
  fadedNodeStrength,
  fadedSurfaceShadows,
  insideFadedNode,
} from "../../../styles/node-fade";
import { paneStyle } from "./pane-style";

/**
 * Panda names a class after the rule it stands for: the selector, with `_`
 * for a space, then the property and the value. So the class list of the pane
 * is its rules.
 */
const rules = paneStyle.split(" ").map((name) => {
  const [, selector = "", declaration = ""] =
    /^\[(.*)\]:([^[\]]*(?:\[.*\])?)$/.exec(name) ?? [];
  return { name, selector, declaration };
});

/** The rules for what is inside a node, or for a node itself. */
const nodeRules = rules.filter(({ selector }) =>
  selector.includes(".react-flow__node"),
);

/** How a rule names a node outside the focused neighbourhood. */
const fadedNode = `&${insideFadedNode.replace(/ \*$/, "").replaceAll(" ", "_")}`;

describe("the fade of the arcs", () => {
  it("times the opacity of no group of an arc, which would be a layer for the length of the fade", () => {
    const timed = rules.filter(({ declaration }) =>
      /^trs_\[(.*,_)?opacity_/.test(declaration),
    );

    expect(timed.map(({ selector }) => selector)).toEqual(["&_.minimap-shape"]);
  });
});

describe("the fade of a node", () => {
  it("has rules to read", () => {
    expect(nodeRules.length).toBeGreaterThan(10);
    expect(
      nodeRules.filter(({ selector }) => selector.startsWith(fadedNode)).length,
    ).toBeGreaterThan(8);
  });

  it("puts no opacity on a node or on anything inside one", () => {
    const opacities = [
      ...nodeRules,
      ...rules.filter(({ selector }) => /\.node-[a-z]+/.test(selector)),
    ].filter(({ declaration }) => /^op_|(?<![a-z-])opacity/.test(declaration));

    expect(opacities.map(({ name }) => name)).toEqual([]);
  });

  it("times nothing that a node draws, so that a node dims in one frame", () => {
    const timed = rules.filter(
      ({ declaration }) =>
        /^(trs|transition)/.test(declaration) &&
        !declaration.endsWith("_[none]"),
    );
    // What the pane fades: the strokes of the arcs and the shapes of the map.
    const outsideNodes = timed.filter(({ selector }) =>
      selector
        .split(",_")
        .every((part) =>
          /_\.(arc-[a-z]+|fusion-line|minimap-shape)$/.test(part),
        ),
    );

    expect(outsideNodes.length).toBeGreaterThan(3);
    expect(
      timed
        .filter((rule) => !outsideNodes.includes(rule))
        .map(({ name }) => name),
    ).toEqual([
      // The wrapper of a component instance grows and shrinks with a fold.
      "[&_.react-flow__node.react-flow__node-componentInstance]:trs_[height_var(--canvas-fold-duration,_180ms)_var(--canvas-fold-easing)]",
    ]);
  });

  it("starts the shadows of a faded surface inset, which the transition of a surface cannot mix", () => {
    const surface = nodeFocusStyle({ focus: "none" }).split(" ");
    const fadedShadows = nodeRules
      .filter(({ selector }) => selector === `${fadedNode}_.node-surface`)
      .map(({ declaration }) => declaration)
      .filter((declaration) => declaration.startsWith("bx-sh_"));

    expect(
      surface.filter((name) => /^trs_.*box-shadow/.test(name)),
    ).toHaveLength(1);
    expect(
      surface.filter((name) => /^bx-sh_\[(?!inset)/.test(name)),
    ).toHaveLength(1);
    expect(fadedShadows).toHaveLength(1);
    expect(fadedShadows[0]).toMatch(/^bx-sh_\[inset_/);
  });

  it("lists the shadows of a faded surface as the flash of a firing lists them, which fades its glow into them", () => {
    const glow = "var(--focus-glow, 0 0 0 3px #fff0)";

    expect(paneStyle.split(" ")).toContain(
      `[${fadedNode}_.node-surface]:bx-sh_[${fadedSurfaceShadows(glow).replaceAll(" ", "_")}]`,
    );
  });

  it("changes nothing on the node itself, which every element of it would inherit from", () => {
    const onTheNode = rules.filter(({ selector }) => selector === fadedNode);

    expect(onTheNode.map(({ name }) => name)).toEqual([]);
  });

  it("sets no custom property and no inherited colour on an element that holds others", () => {
    const inherited = nodeRules
      .filter(({ selector }) => selector.startsWith(fadedNode))
      .filter(
        ({ selector, declaration }) =>
          declaration.startsWith("--") ||
          // A text holds no element: `faded-node-parts.test.tsx` holds that.
          (declaration.startsWith("c_") && !selector.includes(".node-text")),
      );

    expect(inherited.map(({ name }) => name)).toEqual([]);
  });

  it("draws every part of a faded node at the one strength `node-fade.ts` names", () => {
    const faded = nodeRules.filter(({ selector }) =>
      selector.startsWith(fadedNode),
    );
    const mixed = faded.filter(({ declaration }) =>
      declaration.includes("color-mix"),
    );
    const shapes = faded.filter(({ declaration }) =>
      /^(fill-opacity|stk-op)_/.test(declaration),
    );

    expect(mixed.length).toBeGreaterThan(6);
    expect(
      mixed
        .filter(
          ({ declaration }) =>
            !declaration.includes(`_${fadedNodeStrength * 100}%,`),
        )
        .map(({ name }) => name),
    ).toEqual([]);
    expect(shapes.length).toBeGreaterThan(1);
    // A shape is drawn at that strength, or not at all.
    expect(
      shapes
        .map(({ declaration }) => declaration.replace(/^.*_/, ""))
        .filter(
          (value) => value !== `[${fadedNodeStrength}]` && value !== "[0]",
        ),
    ).toEqual([]);
  });

  it("mixes a cover toward the colour of the canvas, as the flash of a firing does", () => {
    const covers = nodeRules.filter(({ selector }) =>
      selector.includes(".node-cover"),
    );

    expect(covers.length).toBeGreaterThan(2);
    expect(
      covers
        .filter(
          ({ declaration }) => !declaration.endsWith(`,_${canvasColor})]`),
        )
        .map(({ name }) => name),
    ).toEqual([]);
    expect(fadedCoverColor("black")).toBe(
      `color-mix(in srgb, black ${fadedNodeStrength * 100}%, ${canvasColor})`,
    );
  });

  it("ends no rule in a class that every handle of every node has", () => {
    const onHandles = rules.filter(({ selector }) =>
      /react-flow__handle|\.source|\.target/.test(selector),
    );

    expect(onHandles.map(({ name }) => name)).toEqual([]);
  });

  it("finds the parts of a faded node by the classes `node-fade.ts` names", () => {
    const classes = new Set(
      nodeRules
        .filter(({ selector }) => selector.startsWith(fadedNode))
        .flatMap(({ selector }) =>
          [
            ...selector.slice(fadedNode.length).matchAll(/\.(node-[a-z]+)/g),
          ].map(([, name]) => name),
        ),
    );

    expect(classes).toEqual(
      new Set([
        "node-surface",
        "node-text",
        "node-fill",
        "node-border",
        "node-inlay",
        "node-cover",
        // Named to be left out: the animation of a firing fades its bolt.
        "node-bolt",
      ]),
    );
  });
});
