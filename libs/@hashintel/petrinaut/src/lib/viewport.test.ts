import { describe, expect, it } from "vitest";
import { recenterToFitViewport } from "./viewport";
import { getNodesBounds } from "@xyflow/react";
import type {
  PetrinautReactFlowInstance,
  NodeType,
} from "../views/SDCPN/reactflow-types";

const reactFlow = { getNodesBounds } as PetrinautReactFlowInstance;

const makeNode = (x: number, y: number, width: number, height: number) =>
  ({
    id: `node-${x}-${y}`,
    position: { x, y },
    data: {},
    measured: { width, height },
  }) as NodeType;

const viewport = { x: 0, y: 0, width: 500, height: 400 };

describe("recenterToFitViewport", () => {
  it("returns undefined when nodes are fully inside viewport", () => {
    const nodes = [makeNode(50, 50, 100, 80)];
    expect(recenterToFitViewport(reactFlow, viewport, nodes)).toBeUndefined();
  });

  it("returns adjustment when nodes overflow to the right", () => {
    const nodes = [makeNode(450, 50, 100, 80)];
    // Node right edge is 550, viewport right is 500 → overflow right by 50
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(50);
    expect(result!.y).toBe(0);
  });

  it("returns adjustment when nodes overflow to the left", () => {
    const nodes = [makeNode(-30, 50, 20, 80)];
    // Node left edge is -30, viewport left is 0 → overflow left by 30
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(-30);
    expect(result!.y).toBe(0);
  });

  it("returns adjustment when nodes overflow the bottom", () => {
    const nodes = [makeNode(50, 350, 80, 100)];
    // Node bottom edge is 450, viewport bottom is 400 → overflow bottom by 50
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(50);
  });

  it("returns adjustment when nodes overflow the top", () => {
    const nodes = [makeNode(50, -40, 80, 20)];
    // Node top edge is -40, viewport top is 0 → overflow top by 40
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(-40);
  });

  it("returns adjustment for diagonal overflow (right + bottom)", () => {
    const nodes = [makeNode(420, 330, 100, 100)];
    // Right overflow: 520-500=20, Bottom overflow: 430-400=30
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(20);
    expect(result!.y).toBe(30);
  });

  it("returns undefined when nodes are too large to fit", () => {
    const nodes = [makeNode(0, 0, 600, 500)];
    // 600 > 500 width, 500 > 400 height — can't fit
    expect(recenterToFitViewport(reactFlow, viewport, nodes)).toBeUndefined();
  });

  it("returns undefined when nodes exactly match viewport size", () => {
    // canFitInViewport uses strict <, so equal size means it can't fit
    const nodes = [makeNode(-10, -10, 500, 400)];
    expect(recenterToFitViewport(reactFlow, viewport, nodes)).toBeUndefined();
  });

  it("handles multiple nodes whose combined bounds overflow", () => {
    const nodes = [makeNode(-20, 50, 40, 40), makeNode(480, 50, 30, 40)];
    // Combined bounds: x=-20..510, y=50..90 → width=530 > 500, won't fit
    expect(recenterToFitViewport(reactFlow, viewport, nodes)).toBeUndefined();
  });

  it("handles multiple nodes that fit but are partially offscreen", () => {
    const nodes = [makeNode(-20, 50, 40, 40), makeNode(200, 50, 30, 40)];
    // Combined bounds: x=-20..240, y=50..90 → width=260, height=40 — fits
    // Left overflow: -20
    const result = recenterToFitViewport(reactFlow, viewport, nodes);
    expect(result).toBeDefined();
    expect(result!.x).toBe(-20);
    expect(result!.y).toBe(0);
  });
});
