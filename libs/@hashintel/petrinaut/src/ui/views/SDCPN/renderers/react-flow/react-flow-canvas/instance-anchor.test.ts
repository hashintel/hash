import { describe, expect, it } from "vitest";

import { documentPositionOf, instanceFlowPosition } from "./instance-anchor";

import type {
  CanvasComponentInstanceNode,
  CanvasNode,
} from "../../../canvas-scene";

const card = (
  overrides: Partial<CanvasComponentInstanceNode>,
): CanvasComponentInstanceNode => ({
  kind: "componentInstance",
  id: "cell",
  label: "Cell",
  position: { x: 300, y: 200 },
  width: 200,
  height: 96,
  dragging: false,
  selected: false,
  hovered: false,
  focus: "none",
  subnetName: "Cell",
  binding: { kind: "component" },
  icon: null,
  color: null,
  ports: [],
  foldable: true,
  unfolded: false,
  anchorOffset: 0,
  ...overrides,
});

describe("instance anchor", () => {
  it("holds a card by the middle of its top edge", () => {
    expect(instanceFlowPosition(card({}))).toEqual({ x: 300, y: 152 });
  });

  it("keeps the top edge where it is when the card unfolds", () => {
    const folded = card({});
    // Unfolded by 140: the scene moves the centre down by half of that.
    const unfolded = card({
      unfolded: true,
      height: 236,
      position: { x: 300, y: 270 },
      anchorOffset: 70,
    });
    expect(instanceFlowPosition(unfolded)).toEqual(
      instanceFlowPosition(folded),
    );
  });

  it("returns a moved card to the position the document stores", () => {
    const unfolded = card({
      unfolded: true,
      height: 236,
      position: { x: 300, y: 270 },
      anchorOffset: 70,
    });
    const moved = { x: 340, y: 172 };
    // The folded card's centre: its top edge plus half the folded height.
    expect(documentPositionOf(unfolded, moved)).toEqual({ x: 340, y: 220 });
    expect(documentPositionOf(card({}), moved)).toEqual({ x: 340, y: 220 });
  });

  it("leaves other nodes' positions as React Flow reports them", () => {
    const place: CanvasNode = {
      kind: "place",
      id: "place",
      label: "Place",
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      dragging: false,
      selected: false,
      hovered: false,
      focus: "none",
      portDirection: null,
      dynamicsEnabled: false,
      hasColorType: false,
      hasVisualizer: false,
      visualizerKeptOpen: false,
      visualizerActive: false,
      typeColor: undefined,
    };
    expect(documentPositionOf(place, { x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
    });
    expect(documentPositionOf(undefined, { x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
    });
  });
});
