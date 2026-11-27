/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { ConnectionLineType, type InternalNode, Position } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import { ArcLayerContext } from "./arc-layer-context";
import { OutlineConnectionLine } from "./outline-connection-line";
import { nodes, scene } from "./scene.test-helpers";

import type { CanvasScene } from "../../../canvas-scene";
import type { NodeType } from "./react-flow-types";

afterEach(cleanup);

const gestures = {
  selectLink: () => {},
  enterItem: () => {},
  clearHover: () => {},
  isAddMode: false,
};

/** A node of the test scene as React Flow hands it to the connection line. */
const flowNode = (id: string) => {
  const data = nodes.find((node) => node.id === id);
  if (!data) {
    throw new Error(`no node ${id}`);
  }
  return { id, data } as unknown as InternalNode<NodeType>;
};

const handle = {
  id: null,
  nodeId: "place",
  type: "source" as const,
  position: Position.Right,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/** The path of a line drawn from the place, here onto the transition. */
const lineOf = (
  input: CanvasScene,
  connectionStatus: "valid" | "invalid" = "valid",
) => {
  const { container } = render(
    <ArcLayerContext value={{ scene: input, gestures }}>
      <svg>
        <OutlineConnectionLine
          connectionLineType={ConnectionLineType.Bezier}
          fromNode={flowNode("place")}
          fromHandle={handle}
          fromX={50}
          fromY={0}
          fromPosition={Position.Right}
          toNode={flowNode("transition")}
          toHandle={{ ...handle, nodeId: "transition", type: "target" }}
          toX={220}
          toY={200}
          toPosition={Position.Left}
          connectionStatus={connectionStatus}
          pointer={{ x: 220, y: 200 }}
        />
      </svg>
    </ArcLayerContext>,
  );
  const path = container
    .querySelector(".react-flow__connection-path")
    ?.getAttribute("d");
  cleanup();
  return path;
};

const noLines: CanvasScene = { ...scene, arcs: [], fusions: [] };
/** An arc from the transition back to the place. */
const arcBack: CanvasScene = { ...noLines, arcs: scene.arcs.slice(1, 2) };
const linkBack: CanvasScene = {
  ...noLines,
  fusions: [
    {
      id: "link",
      fusionId: "belt",
      name: "Belt",
      sourceId: "transition",
      targetId: "place",
      sourcePortId: null,
      targetPortId: null,
      selected: false,
      severity: null,
      focus: "none",
      movableEnds: "both",
    },
  ],
};

describe("the arc being drawn", () => {
  it("runs between the outlines of its two nodes once its target is valid", () => {
    expect(lineOf(noLines)).toMatch(/^M[-\d.]+,[-\d.]+C/);
    expect(lineOf(noLines)).not.toBe(lineOf(noLines, "invalid"));
  });

  it("takes the other lane when an arc runs the other way between its nodes", () => {
    expect(lineOf(arcBack)).not.toBe(lineOf(noLines));
  });

  it("takes the other lane for a fusion link the other way, as for an arc", () => {
    expect(lineOf(linkBack)).toBe(lineOf(arcBack));
  });

  it("stays in its own lane for a line the same way", () => {
    expect(lineOf({ ...noLines, arcs: scene.arcs.slice(0, 1) })).toBe(
      lineOf(noLines),
    );
  });

  it("runs to the pointer in one lane until its target is valid", () => {
    expect(lineOf(arcBack, "invalid")).toBe(lineOf(noLines, "invalid"));
  });
});
