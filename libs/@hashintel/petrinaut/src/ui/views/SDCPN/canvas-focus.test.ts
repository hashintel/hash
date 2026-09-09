import { describe, expect, it } from "vitest";

import { generateArcId, getArcEndpointKey } from "@hashintel/petrinaut-core";

import { buildNetAdjacency, resolveCanvasFocus } from "./canvas-focus";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { Place, Transition } from "@hashintel/petrinaut-core";

const place = (id: string): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): Transition => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard",
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

/** p1 → t1 → p2 → t2 → p1: a cycle, plus an unconnected place. */
const net: ActiveNetDefinition = {
  places: [place("p1"), place("p2"), place("lonely")],
  transitions: [
    transition("t1", ["p1"], ["p2"]),
    transition("t2", ["p2"], ["p1"]),
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
};

const placeKey = (placeId: string) =>
  getArcEndpointKey({ kind: "place", placeId });

const p1ToT1 = generateArcId({ inputId: placeKey("p1"), outputId: "t1" });
const t1ToP2 = generateArcId({ inputId: "t1", outputId: placeKey("p2") });
const p2ToT2 = generateArcId({ inputId: placeKey("p2"), outputId: "t2" });
const t2ToP1 = generateArcId({ inputId: "t2", outputId: placeKey("p1") });

const adjacency = buildNetAdjacency(net);

const focusOn = (id: string) =>
  resolveCanvasFocus({ adjacency, hoveredId: id, selectedIds: new Set() });

describe("resolveCanvasFocus", () => {
  it("focuses nothing when nothing is hovered or selected", () => {
    const focus = resolveCanvasFocus({
      adjacency,
      hoveredId: null,
      selectedIds: new Set(),
    });

    expect(focus.active).toBe(false);
    expect(focus.nodeFocus("p1")).toBe("none");
    expect(focus.arcFocus(p1ToT1)).toBe("none");
  });

  it("splits a hovered transition's neighbours by direction", () => {
    const focus = focusOn("t1");

    expect(focus.active).toBe(true);
    expect(focus.nodeFocus("t1")).toBe("focused");
    expect(focus.nodeFocus("p1")).toBe("upstream");
    expect(focus.nodeFocus("p2")).toBe("downstream");
    // Everything outside the neighbourhood keeps its plain role: `active`
    // tells the pane to mute it, so a hover rewrites nothing else.
    expect(focus.nodeFocus("lonely")).toBe("none");
  });

  it("roles the arcs at a focused node by the direction they carry tokens", () => {
    const focus = focusOn("t1");

    expect(focus.arcFocus(p1ToT1)).toBe("incoming");
    expect(focus.arcFocus(t1ToP2)).toBe("outgoing");
    expect(focus.arcFocus(p2ToT2)).toBe("none");
  });

  it("marks a neighbour that is both a source and a sink as bidirectional", () => {
    // t1 consumes from p1 and produces into p1, so p1 is both upstream and
    // downstream of it.
    const focus = resolveCanvasFocus({
      adjacency: buildNetAdjacency({
        ...net,
        transitions: [transition("t1", ["p1"], ["p1"])],
      }),
      hoveredId: "t1",
      selectedIds: new Set(),
    });

    expect(focus.nodeFocus("p1")).toBe("bidirectional");
  });

  it("puts the nodes a focused arc joins either side of it", () => {
    const focus = focusOn(t1ToP2);

    expect(focus.arcFocus(t1ToP2)).toBe("focused");
    expect(focus.nodeFocus("t1")).toBe("upstream");
    expect(focus.nodeFocus("p2")).toBe("downstream");
  });

  it("treats an arc between two focused nodes as part of the focus", () => {
    const focus = resolveCanvasFocus({
      adjacency,
      hoveredId: null,
      selectedIds: new Set(["p1", "t1"]),
    });

    expect(focus.arcFocus(p1ToT1)).toBe("focused");
    expect(focus.arcFocus(t1ToP2)).toBe("outgoing");
    expect(focus.arcFocus(t2ToP1)).toBe("incoming");
  });

  it("takes its focus from the hover, keeping the selection ringed", () => {
    const focus = resolveCanvasFocus({
      adjacency,
      hoveredId: "t2",
      selectedIds: new Set(["t1"]),
    });

    expect(focus.nodeFocus("t2")).toBe("focused");
    // Hovering elsewhere must not lose sight of what is selected.
    expect(focus.nodeFocus("t1")).toBe("focused");
    // The hover, not the selection, decides the neighbourhood.
    expect(focus.arcFocus(p2ToT2)).toBe("incoming");
    expect(focus.arcFocus(p1ToT1)).toBe("none");
  });

  it("focuses nothing when the selection names no canvas item", () => {
    const focus = resolveCanvasFocus({
      adjacency,
      hoveredId: null,
      selectedIds: new Set(["some-type-id"]),
    });

    expect(focus.active).toBe(false);
    expect(focus.nodeFocus("p1")).toBe("none");
  });
  it("indexes a node's neighbours once, for lookup", () => {
    const index = buildNetAdjacency(net);

    expect(index.canvasIds.has("t1")).toBe(true);
    expect(index.canvasIds.has("some-type-id")).toBe(false);
    expect(index.byNode.get("t1")?.upstream).toEqual(["p1"]);
    expect(index.byNode.get("t1")?.downstream).toEqual(["p2"]);
    expect(index.byNode.get("lonely")).toEqual({
      upstream: [],
      downstream: [],
      incoming: [],
      outgoing: [],
    });
    expect(index.arcEnds.get(t1ToP2)).toEqual({
      sourceId: "t1",
      targetId: "p2",
    });
  });
});
