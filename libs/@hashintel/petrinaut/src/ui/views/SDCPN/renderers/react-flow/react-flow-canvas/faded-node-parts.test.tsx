/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CanvasFrameStore,
  CanvasFrameStoreContext,
} from "../../../canvas-frame-store-context";
import { fadedNodeStrength } from "../../../styles/node-fade";
import { classicNodeTypes, compactNodeTypes } from "./node-types";

import type {
  CanvasComponentInstanceNode,
  CanvasNode,
  CanvasNodeKind,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";

afterEach(cleanup);

const nodeBase = {
  position: { x: 0, y: 0 },
  width: 180,
  height: 50,
  label: "Node",
  dragging: false,
  selected: false,
  focus: "none" as const,
};

/** A port place of a typed token, with dynamics: every part a place can draw. */
const place: CanvasPlaceNode = {
  ...nodeBase,
  id: "place",
  kind: "place",
  portDirection: "inout",
  dynamicsEnabled: true,
  hasVisualizer: false,
  visualizerKeptOpen: false,
  visualizerActive: false,
  typeColor: "#30a46c",
};

const transition: CanvasTransitionNode = {
  ...nodeBase,
  id: "transition",
  kind: "transition",
  lambdaType: "stochastic",
};

const instance: CanvasComponentInstanceNode = {
  ...nodeBase,
  id: "instance",
  kind: "componentInstance",
  height: 120,
  componentName: "Component",
  binding: { kind: "interface", implementationName: null },
  icon: null,
  color: "#30a46c",
  ports: [
    { id: "in", name: "In", direction: "in", typeColor: "#30a46c" },
    { id: "out", name: "Out", direction: "out", typeColor: undefined },
  ],
  foldable: true,
  unfolded: true,
  anchorOffset: 0,
};

/**
 * The nodes each kind is drawn for. The type asks for an entry for a kind
 * added to the canvas.
 */
const fixtures: Record<CanvasNodeKind, [string, CanvasNode][]> = {
  place: [
    ["a port with dynamics and a token type", place],
    [
      "plain",
      {
        ...place,
        portDirection: null,
        dynamicsEnabled: false,
        typeColor: undefined,
      },
    ],
  ],
  transition: [
    ["stochastic", transition],
    ["a predicate", { ...transition, lambdaType: "predicate" }],
    ["plain", { ...transition, lambdaType: "none" }],
  ],
  componentInstance: [
    ["of an interface nothing runs for, unfolded, coloured", instance],
    ["folded, without a colour", { ...instance, color: null, unfolded: false }],
    [
      "with an icon of its own",
      {
        ...instance,
        binding: { kind: "component" },
        icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>',
      },
    ],
  ],
};

/** A frame in which every place holds tokens, so that a place draws its count. */
const frameStore: CanvasFrameStore = {
  subscribe: () => () => {},
  getTokenLabel: () => "7",
  getTransitionFrame: () => null,
};

const propsOf = (data: CanvasNode) =>
  ({
    id: data.id,
    data,
    type: data.kind,
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  }) as unknown as NodeProps;

type NodeComponent = React.ComponentType<NodeProps>;

/** Every component the canvas draws a node with, and the kind it draws. */
const components = [
  ...Object.entries(compactNodeTypes).map(
    ([kind, component]) => [`compact ${kind}`, kind, component] as const,
  ),
  ...Object.entries(classicNodeTypes)
    .filter(
      ([kind, component]) =>
        compactNodeTypes[kind as CanvasNodeKind] !== component,
    )
    .map(([kind, component]) => [`classic ${kind}`, kind, component] as const),
] as unknown as [string, CanvasNodeKind, NodeComponent][];

const cases = components.flatMap(([name, kind, Component]) =>
  fixtures[kind].map(
    ([variant, data]) =>
      [`a ${name}, ${variant}`, Component, data] as [
        string,
        NodeComponent,
        CanvasNode,
      ],
  ),
);

const draw = (Component: NodeComponent, data: CanvasNode) =>
  render(
    <ReactFlowProvider>
      <CanvasFrameStoreContext value={frameStore}>
        <Component {...propsOf(data)} />
      </CanvasFrameStoreContext>
    </ReactFlowProvider>,
  ).container;

/** The classes of an element that are styles: `<condition>:<property>_<value>`. */
const stylesOf = (element: Element) =>
  [...element.classList].flatMap((name) => {
    // React Flow's own classes name no style.
    const match = name.startsWith("react-flow__")
      ? null
      : /^(?:(.*):)?(-{0,2}[a-z][a-z-]*)_(.*)$/.exec(name);
    return match
      ? [
          {
            name,
            condition: match[1] ?? "",
            property: match[2] ?? "",
            value: match[3] ?? "",
          },
        ]
      : [];
  });

const has = (element: Element, ...classes: string[]) =>
  classes.some((name) => element.classList.contains(name));

const describeElement = (element: Element) =>
  `<${element.tagName.toLowerCase()} class="${element.getAttribute("class") ?? ""}">`;

/** Everything a node renders but its icons: an icon fades by a rule of its own. */
const elementsOf = (container: Element) =>
  [...container.querySelectorAll("*")].filter(
    (element) => element.closest("svg") === null,
  );

const holdsText = (element: Element) =>
  [...element.childNodes].some(
    (child) => child.nodeType === 3 && child.textContent?.trim(),
  );

/**
 * The properties that draw nothing by themselves: where a part is, how large
 * it is, how its text is set and how it moves. A property that is not here
 * draws, and the element that sets it needs the class of the part it draws.
 */
const drawsNothing =
  /^(--[a-z-]+|content|pos|inset|top|right|bottom|left|z|d|flex|flex-d|flex-sh|ai|jc|gap|p|w|h|min-w|max-w|bx-s|ov|tov|white-space|ta|ov-wrap|lc|fs|fw|lh|fv-num|bdr|cursor|pointer-events|trf|trf-o|trs|trs-dur|trs-prop|trs-tmf|transition-behavior)$/;

/** What each class of `node-fade.ts` fades, as Panda abbreviates the property. */
const fadedBy: [string, RegExp][] = [
  // The fill, the ring and the glow in its shadow, and its outline, which is
  // transparent on a node without a role.
  ["node-surface", /^(bg-c|bx-sh|ring|ring-o)$/],
  ["node-fill", /^bg-c$/],
  ["node-inlay", /^bg-c$/],
  ["node-cover", /^(bg|bg-c)$/],
  ["node-border", /^(bd(-[a-z])?(-[cws])?|border-style)$/],
];

/** Whether a style of `element` draws something no rule of the pane fades. */
const drawsUnfaded = (
  element: Element,
  { condition, property, value }: ReturnType<typeof stylesOf>[number],
) => {
  // A pseudo-element that holds text draws it, and no rule fades that.
  if (property === "content") {
    return value !== '""';
  }
  if (
    drawsNothing.test(property) ||
    ["none", "[transparent]"].includes(value)
  ) {
    return false;
  }
  // A colour is drawn by the text that takes it, or by an icon.
  if (property === "c") {
    return holdsText(element) && !has(element, "node-text");
  }
  // A part is there or it is not.
  if (property === "op") {
    return !["[0]", "[1]", "0", "1"].includes(value);
  }
  // No rule of the pane reaches a pseudo-element of a part.
  if (/\b(after|before)\b/.test(condition)) {
    return true;
  }
  return !fadedBy.some(
    ([part, properties]) => has(element, part) && properties.test(property),
  );
};

/**
 * The two things a node draws at full strength while it is faded, both under
 * the pointer or the keyboard: the dot a handle offers an arc from, and the
 * outline of a handle an arc can land on, which the pane fades by
 * `data-arc-target`.
 */
const isHandleFeedback = (
  element: Element,
  { condition }: ReturnType<typeof stylesOf>[number],
) => has(element, "react-flow__handle") && /\bafter\b/.test(condition);

describe.each(cases)("%s", (_name, Component, data) => {
  it("draws nothing that the pane does not fade", () => {
    const unfaded = elementsOf(draw(Component, data)).flatMap((element) =>
      stylesOf(element)
        .filter(
          (style) =>
            drawsUnfaded(element, style) && !isHandleFeedback(element, style),
        )
        .map(({ name }) => `${name} on ${describeElement(element)}`),
    );

    expect(unfaded).toEqual([]);
  });

  it("draws with elements and shapes the pane knows how to fade", () => {
    const container = draw(Component, data);
    const strangers = [...container.querySelectorAll("*")].filter((element) =>
      element.closest("svg") === null
        ? !/^(div|span|button)$/i.test(element.tagName)
        : !/^(svg|g|defs|title|path|circle|ellipse|rect|line|polyline|polygon)$/i.test(
            element.tagName,
          ),
    );

    expect(strangers.map(describeElement)).toEqual([]);
  });

  it("styles no part in place with something that draws", () => {
    const inline = elementsOf(draw(Component, data)).flatMap((element) => {
      const { style } = element as HTMLElement;
      return Array.from({ length: style.length }, (_, index) =>
        style.item(index),
      )
        .filter(
          (property) =>
            (/^(background|border|outline|box-shadow|filter|text-shadow)/.test(
              property,
            ) &&
              // A handle resets what React Flow would draw for it.
              !/^(none|transparent)$/.test(style.getPropertyValue(property))) ||
            (property === "opacity" &&
              !["0", "1"].includes(style.getPropertyValue(property))) ||
            (property === "color" && holdsText(element)),
        )
        .map((property) => `${property} on ${describeElement(element)}`);
    });

    expect(inline).toEqual([]);
  });

  it("marks every element that holds text, and none of them holds an element", () => {
    const texts = elementsOf(draw(Component, data)).filter(holdsText);

    expect(texts.length).toBeGreaterThan(0);
    expect(
      texts
        .filter((element) => !has(element, "node-text"))
        .map(describeElement),
    ).toEqual([]);
    expect(texts.filter((element) => element.childElementCount > 0)).toEqual(
      [],
    );
  });

  it("names the colour of every text that has one as --node-text", () => {
    const coloured = [
      ...draw(Component, data).querySelectorAll(".node-text"),
    ].flatMap((element) =>
      stylesOf(element).filter(({ property }) => property === "c"),
    );

    expect(coloured.map(({ value }) => value)).toEqual(
      coloured.map(() => "[var(--node-text)]"),
    );
  });

  it("draws every background as --node-fill and every border as --node-border", () => {
    const named = elementsOf(draw(Component, data)).flatMap((element) => {
      const styles = stylesOf(element);
      // A part may write the colour it names as its fill, in place of the name.
      const fill = styles.find(({ property }) => property === "--node-fill");
      return styles
        .filter(({ condition, property, value }) => {
          if (/\b(after|before)\b/.test(condition)) {
            return false;
          }
          if (/^(bg|bg-c)$/.test(property)) {
            return ![
              "[var(--node-fill)]",
              "[transparent]",
              `[${fill?.value}]`,
            ].includes(value);
          }
          if (/^bd(-[a-z])?-c$/.test(property)) {
            return !value.startsWith("[var(--node-border");
          }
          // A border written whole, with its colour.
          return (
            /^bd(-[a-z])?$/.test(property) &&
            /#|rgb|colors|var\(/.test(value) &&
            !value.includes("var(--node-border)")
          );
        })
        .map(({ name }) => `${name} on ${describeElement(element)}`);
    });

    expect(named).toEqual([]);
  });

  it("writes the strength of a faded node into its own faded colours", () => {
    const fadedColours = elementsOf(draw(Component, data)).flatMap((element) =>
      stylesOf(element).filter(({ property }) =>
        property.startsWith("--node-faded"),
      ),
    );

    expect(
      fadedColours
        .filter(
          ({ value }) =>
            value.includes("color-mix") &&
            !value.includes(`${fadedNodeStrength * 100}%`),
        )
        .map(({ name }) => name),
    ).toEqual([]);
  });

  it("gives no transition of the pane to a part that changes under the pointer", () => {
    const answering = elementsOf(draw(Component, data)).filter(
      (element) =>
        !has(element, "node-surface") &&
        stylesOf(element).some(({ condition }) => /\bhover\b/.test(condition)),
    );

    expect(
      answering
        .filter(
          (element) =>
            has(element, "node-text", "node-fill", "node-cover") &&
            !has(element, "node-folds"),
        )
        .map(describeElement),
    ).toEqual([]);
  });
});

it("draws every kind of node the canvas has, compact and classic", () => {
  expect(Object.keys(classicNodeTypes).sort()).toEqual(
    Object.keys(compactNodeTypes).sort(),
  );
  expect(Object.keys(fixtures).sort()).toEqual(
    Object.keys(compactNodeTypes).sort(),
  );
  expect(cases.length).toBeGreaterThan(10);
});
