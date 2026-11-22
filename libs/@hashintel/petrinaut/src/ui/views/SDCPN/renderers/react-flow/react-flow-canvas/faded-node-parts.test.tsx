/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { type NodeProps, ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CanvasFrameStore,
  CanvasFrameStoreContext,
} from "../../../canvas-frame-store-context";
import { ClassicPlaceNode } from "./classic-place-node";
import { ClassicTransitionNode } from "./classic-transition-node";
import { ComponentInstanceNode } from "./component-instance-node";
import { PlaceNode } from "./place-node";
import { TransitionNode } from "./transition-node";

import type {
  CanvasComponentInstanceNode,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";
import type {
  ComponentInstanceNodeType,
  NodeType,
  PlaceNodeType,
  TransitionNodeType,
} from "./react-flow-types";

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

/** A frame in which every place holds tokens, so that a place draws its count. */
const frameStore: CanvasFrameStore = {
  subscribe: () => () => {},
  getTokenLabel: () => "7",
  getTransitionFrame: () => null,
};

const propsOf = <Node extends NodeType>(data: Node["data"]): NodeProps<Node> =>
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
  }) as unknown as NodeProps<Node>;

const kinds: [string, React.ReactElement][] = [
  ["a compact place", <PlaceNode key="1" {...propsOf<PlaceNodeType>(place)} />],
  [
    "a classic place",
    <ClassicPlaceNode key="2" {...propsOf<PlaceNodeType>(place)} />,
  ],
  [
    "a compact transition",
    <TransitionNode key="3" {...propsOf<TransitionNodeType>(transition)} />,
  ],
  [
    "a classic transition",
    <ClassicTransitionNode
      key="4"
      {...propsOf<TransitionNodeType>(transition)}
    />,
  ],
  [
    "a component instance",
    <ComponentInstanceNode
      key="5"
      {...propsOf<ComponentInstanceNodeType>(instance)}
    />,
  ],
  [
    "a folded component instance without a colour",
    <ComponentInstanceNode
      key="6"
      {...propsOf<ComponentInstanceNodeType>({
        ...instance,
        color: null,
        unfolded: false,
      })}
    />,
  ],
];

const draw = (node: React.ReactElement) =>
  render(
    <ReactFlowProvider>
      <CanvasFrameStoreContext value={frameStore}>
        {node}
      </CanvasFrameStoreContext>
    </ReactFlowProvider>,
  ).container;

/** The classes of an element that are styles: `<condition>:<property>_<value>`. */
const stylesOf = (element: Element) =>
  [...element.classList].map((name) => {
    const [, condition = "", property = "", value = ""] =
      /^(?:(.*):)?([a-z-]+)_(.*)$/.exec(name) ?? [];
    return { name, condition, property, value };
  });

/** The styles of the element itself, without those of its pseudo-elements. */
const ownStylesOf = (element: Element) =>
  stylesOf(element).filter(
    ({ condition }) => !/\b(after|before)\b/.test(condition),
  );

const isBackground = (property: string) =>
  property === "bg" || property === "bg-c";

const has = (element: Element, ...classes: string[]) =>
  classes.some((name) => element.classList.contains(name));

const describeElement = (element: Element) =>
  `<${element.tagName.toLowerCase()} class="${element.getAttribute("class") ?? ""}">`;

describe.each(kinds)("%s", (_name, node) => {
  it("gives no element an opacity between 0 and 1", () => {
    const fading = [...draw(node).querySelectorAll("*")].filter((element) =>
      stylesOf(element).some(
        ({ property, value }) =>
          property === "op" && !["[0]", "[1]", "0", "1"].includes(value),
      ),
    );

    expect(fading.map(describeElement)).toEqual([]);
  });

  it("marks every element that holds text, and none of them holds an element", () => {
    const texts = [...draw(node).querySelectorAll("*")].filter((element) =>
      [...element.childNodes].some(
        (child) => child.nodeType === 3 && child.textContent?.trim(),
      ),
    );

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
    const coloured = [...draw(node).querySelectorAll(".node-text")].flatMap(
      (element) => stylesOf(element).filter(({ property }) => property === "c"),
    );

    expect(coloured.map(({ value }) => value)).toEqual(
      coloured.map(() => "[var(--node-text)]"),
    );
  });

  it("marks every element that draws a background, which is --node-fill", () => {
    const filled = [...draw(node).querySelectorAll("*")].filter((element) =>
      ownStylesOf(element).some(
        ({ property, value }) =>
          isBackground(property) && value !== "[transparent]",
      ),
    );

    expect(filled.length).toBeGreaterThan(0);
    expect(
      filled
        .filter(
          (element) =>
            !has(
              element,
              "node-surface",
              "node-fill",
              "node-inlay",
              "node-cover",
            ) ||
            ownStylesOf(element).some(
              ({ property, value }) =>
                isBackground(property) && value !== "[var(--node-fill)]",
            ),
        )
        .map(describeElement),
    ).toEqual([]);
  });

  it("marks every element that draws a border, which is --node-border", () => {
    const bordered = [...draw(node).querySelectorAll("*")].filter((element) =>
      ownStylesOf(element).some(
        ({ property, value }) =>
          /^bd(-[a-z])?$/.test(property) && value !== "none",
      ),
    );

    expect(
      bordered
        .filter(
          (element) =>
            !has(element, "node-border") ||
            ownStylesOf(element).some(
              ({ property, value }) =>
                /^bd(-[a-z])?-c$/.test(property) &&
                !value.startsWith("[var(--node-border"),
            ),
        )
        .map(describeElement),
    ).toEqual([]);
  });

  it("gives no transition of the pane to a part that changes under the pointer", () => {
    const answering = [...draw(node).querySelectorAll("*")].filter(
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
