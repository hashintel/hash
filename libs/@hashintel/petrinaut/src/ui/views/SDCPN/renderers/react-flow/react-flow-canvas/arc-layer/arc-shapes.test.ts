import { Position } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";

import {
  classicNodeDimensions,
  compactNodeDimensions,
} from "@hashintel/petrinaut-core";

import {
  arcBase,
  nodes,
  scene,
  withArcs,
  withNodeAt,
} from "../scene.test-helpers";
import { fixedEndpoint } from "../shared/outline-arcs";
import { arcShapes, type PortEnds } from "./arc-shapes";
import * as geometry from "./arc-shapes/arc-geometry";

import type { CanvasArc } from "../../../../canvas-scene";

const portEnds: PortEnds = new Map([
  [
    "port-input",
    { source: fixedEndpoint(650, 20, Position.Right), target: null },
  ],
  [
    "port-output",
    { source: null, target: fixedEndpoint(550, 20, Position.Left) },
  ],
]);

/** No arc has just lost a focus role. */
const none: ReadonlySet<string> = new Set();

const byId = (shapes: ReturnType<typeof arcShapes>) =>
  Object.fromEntries(shapes.list.map((shape) => [shape.id, shape]));

describe("the shapes of a scene's arcs", () => {
  it.each([false, true])(
    "attaches diagonal arcs to square transition corners with compact nodes %s",
    (compactNodes) => {
      const size = (
        compactNodes ? compactNodeDimensions : classicNodeDimensions
      ).transition;
      const position = { x: size.width * 3, y: size.height * 3 };
      const { list } = arcShapes(
        {
          nodes: nodes.map((node) =>
            node.kind === "transition" ? { ...node, ...size, position } : node,
          ),
          arcs: [
            {
              ...arcBase,
              id: "input",
              sourceId: "place",
              targetId: "transition",
            },
          ],
        },
        new Map(),
        none,
      );

      const end = list[0]?.geometry.curve.end;
      expect(end?.x).toBeCloseTo(position.x - size.width / 2);
      expect(end?.y).toBeCloseTo(position.y - size.height / 2);
    },
  );

  it("attaches arcs to node outlines and component port arcs to the port's pin", () => {
    const shapes = byId(arcShapes(scene, portEnds, none));

    for (const id of ["input", "output"]) {
      expect(shapes[id]?.source).toHaveProperty("cornerRadius");
      expect(shapes[id]?.target).toHaveProperty("cornerRadius");
      expect(shapes[id]?.hasReverseArc).toBe(true);
    }

    expect(shapes["port-input"]?.geometry.curve.start).toEqual({
      x: 650,
      y: 20,
    });
    expect(shapes["port-input"]?.target).toHaveProperty("cornerRadius");
    expect(shapes["port-output"]?.geometry.curve.end).toEqual({
      x: 550,
      y: 20,
    });
    expect(shapes["port-output"]?.source).toHaveProperty("cornerRadius");

    // Into and out of the same component: separate curves at the transition.
    expect(shapes["port-input"]?.hasReverseArc).toBe(true);
    expect(shapes["port-output"]?.hasReverseArc).toBe(true);
  });

  it("keeps the order of the scene and the ids of the nodes each arc joins", () => {
    const { list } = arcShapes(scene, portEnds, none);
    expect(
      list.map((shape) => [shape.id, shape.sourceId, shape.targetId]),
    ).toEqual([
      ["input", "place", "transition"],
      ["output", "transition", "place"],
      ["port-input", "component", "transition"],
      ["port-output", "transition", "component"],
    ]);
  });

  it("leaves out an arc whose pin is not measured, and draws the others", () => {
    const { list } = arcShapes(scene, new Map(), none);
    expect(list.map((shape) => shape.id)).toEqual(["input", "output"]);
  });

  it("leaves out an arc whose node is missing", () => {
    const { list } = arcShapes(
      { ...scene, nodes: nodes.filter((node) => node.id !== "place") },
      portEnds,
      none,
    );
    expect(list.map((shape) => shape.id)).toEqual([
      "port-input",
      "port-output",
    ]);
  });

  it("writes the curve, the curve up to the head, and the head", () => {
    const shape = byId(arcShapes(scene, portEnds, none)).input;

    expect(shape?.paths.curve).toMatch(/^M[-\d.]+,[-\d.]+C/);
    expect(shape?.paths.shaft).toMatch(/^M[-\d.]+,[-\d.]+C/);
    expect(shape?.paths.shaft).not.toBe(shape?.paths.curve);
    expect(shape?.paths.head).toMatch(/^M.*Z$/);
  });
});

describe("the shapes of the scene after", () => {
  it("are the same objects, and the same list, when nothing draws differently", () => {
    const before = arcShapes(scene, portEnds, none);
    // A scene is rebuilt with every node and arc a new object.
    const after = arcShapes(withArcs({}), new Map(portEnds), none, before);

    expect(after.list).toBe(before.list);
  });

  it("keep every arc but the ones whose focus or selection changed", () => {
    const before = arcShapes(scene, portEnds, none);
    const after = arcShapes(
      withArcs({ input: { focus: "outgoing" }, output: { selected: true } }),
      portEnds,
      none,
      before,
    );

    expect(after.list[0]).not.toBe(before.list[0]);
    expect(after.list[0]?.focus).toBe("outgoing");
    expect(after.list[1]).not.toBe(before.list[1]);
    expect(after.list[1]?.selected).toBe(true);
    expect(after.list[2]).toBe(before.list[2]);
    expect(after.list[3]).toBe(before.list[3]);
    // The curve is the same, so it is not computed or written again.
    expect(after.list[0]?.geometry).toBe(before.list[0]?.geometry);
    expect(after.list[0]?.paths).toBe(before.list[0]?.paths);
  });

  it.each<Partial<CanvasArc>>([
    { color: "#abcdef" },
    { weight: 3 },
    { kind: "read" },
  ])(
    "give an arc that changed to %o a new shape, on the curve it had",
    (change) => {
      const before = arcShapes(scene, portEnds, none);
      const after = arcShapes(
        withArcs({ input: change }),
        portEnds,
        none,
        before,
      );

      expect(after.list[0]).not.toBe(before.list[0]);
      expect(after.list[0]).toMatchObject(change);
      expect(after.list[0]?.geometry).toBe(before.list[0]?.geometry);
      expect(after.list[0]?.paths).toBe(before.list[0]?.paths);
      expect(after.list[1]).toBe(before.list[1]);
    },
  );

  it("recompute the arcs of a moved node only, without changing the scene", () => {
    const snapshot = structuredClone(scene);
    const before = arcShapes(scene, portEnds, none);
    const computed = vi.spyOn(geometry, "arcGeometry");

    const after = arcShapes(
      withNodeAt("place", { x: -200, y: 100 }),
      portEnds,
      none,
      before,
    );

    // Two arcs end at the place, and two do not.
    expect(computed).toHaveBeenCalledTimes(2);
    expect(after.list[0]).not.toBe(before.list[0]);
    expect(after.list[0]?.geometry.curve.start).not.toEqual(
      before.list[0]?.geometry.curve.start,
    );
    expect(after.list[2]).toBe(before.list[2]);
    expect(after.list[3]).toBe(before.list[3]);
    expect(scene).toEqual(snapshot);
    computed.mockRestore();
  });

  it("follow a pin that moved", () => {
    const before = arcShapes(scene, portEnds, none);
    const after = arcShapes(
      scene,
      new Map([
        ...portEnds,
        [
          "port-input",
          { source: fixedEndpoint(650, 60, Position.Right), target: null },
        ],
      ]),
      none,
      before,
    );

    expect(after.list[2]?.geometry.curve.start).toEqual({ x: 650, y: 60 });
    expect(after.list[3]).toBe(before.list[3]);
    expect(after.list[0]).toBe(before.list[0]);
  });

  it("take a new lane when an arc the other way appears", () => {
    const oneWay = { ...scene, arcs: scene.arcs.slice(0, 1) };
    const before = arcShapes(oneWay, portEnds, none);
    const after = arcShapes(
      { ...scene, arcs: scene.arcs.slice(0, 2) },
      portEnds,
      none,
      before,
    );

    expect(before.list[0]?.hasReverseArc).toBe(false);
    expect(after.list[0]?.hasReverseArc).toBe(true);
    expect(after.list[0]?.paths.curve).not.toBe(before.list[0]?.paths.curve);
  });
});

describe("the arcs that draw their own strokes", () => {
  const aloneIn = (
    input: Parameters<typeof arcShapes>[0],
    leavingFocus: ReadonlySet<string> = none,
  ) =>
    arcShapes(input, portEnds, leavingFocus)
      .list.filter((shape) => shape.alone)
      .map((shape) => shape.id);

  it("are not the arcs at rest between two nodes", () => {
    // The arcs at the component's port follow its pin.
    expect(aloneIn(scene)).toEqual(["port-input", "port-output"]);
  });

  it.each([
    ["has a focus role", { focus: "incoming" }],
    ["is selected", { selected: true }],
    ["is a read arc", { kind: "read" }],
    ["is an inhibitor arc", { kind: "inhibitor" }],
  ] as const)("include an arc that %s", (_why, change) => {
    expect(aloneIn(withArcs({ input: change }))).toContain("input");
    expect(aloneIn(withArcs({ input: change }))).not.toContain("output");
  });

  it("include an arc that had a role a moment ago", () => {
    expect(aloneIn(scene, new Set(["output"]))).toContain("output");
  });

  it("include the arcs of a node that is being dragged, until it is dropped", () => {
    const dragging = withNodeAt("place", { x: -200, y: 100 });
    expect(aloneIn(dragging)).toContain("input");
    expect(aloneIn(dragging)).toContain("output");

    const before = arcShapes(dragging, portEnds, none);
    const dropped = arcShapes(
      {
        ...dragging,
        nodes: dragging.nodes.map((node) => ({ ...node, dragging: false })),
      },
      portEnds,
      none,
      before,
    );
    // The same curve, drawn with the arcs at rest again.
    expect(dropped.list[0]?.alone).toBe(false);
    expect(dropped.list[0]?.paths).toBe(before.list[0]?.paths);
  });
});
