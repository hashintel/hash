import { describe, expect, it } from "vitest";

import { insideFadedNode } from "../../../styles/node-fade";
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
