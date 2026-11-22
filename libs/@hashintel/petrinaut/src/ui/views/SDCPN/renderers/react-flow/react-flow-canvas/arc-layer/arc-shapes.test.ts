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
import * as geometry from "./arc-geometry";
import { arcShapes, joinedPairs, type PortEnds } from "./arc-shapes";

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
      );

      const end = list[0]?.geometry.curve.end;
      expect(end?.x).toBeCloseTo(position.x - size.width / 2);
      expect(end?.y).toBeCloseTo(position.y - size.height / 2);
    },
  );

  it("attaches arcs to node outlines and component port arcs to the port's pin", () => {
    const shapes = byId(arcShapes(scene, portEnds));

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
    const { list } = arcShapes(scene, portEnds);
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
    const { list } = arcShapes(scene, new Map());
    expect(list.map((shape) => shape.id)).toEqual(["input", "output"]);
  });

  it("leaves out an arc whose node is missing", () => {
    const { list } = arcShapes(
      { ...scene, nodes: nodes.filter((node) => node.id !== "place") },
      portEnds,
    );
    expect(list.map((shape) => shape.id)).toEqual([
      "port-input",
      "port-output",
    ]);
  });

  it("writes the curve, the curve up to the head, and the head", () => {
    const shape = byId(arcShapes(scene, portEnds)).input;

    expect(shape?.paths.curve).toMatch(/^M[-\d.]+,[-\d.]+C/);
    expect(shape?.paths.shaft).toMatch(/^M[-\d.]+,[-\d.]+C/);
    expect(shape?.paths.shaft).not.toBe(shape?.paths.curve);
    expect(shape?.paths.head).toMatch(/^M.*Z$/);
  });
});

describe("the shapes of the scene after", () => {
  it("are the same objects, and the same list, when nothing draws differently", () => {
    const before = arcShapes(scene, portEnds);
    // A scene is rebuilt with every node and arc a new object.
    const after = arcShapes(withArcs({}), new Map(portEnds), before);

    expect(after.list).toBe(before.list);
  });

  it("keep every arc but the ones whose focus or selection changed", () => {
    const before = arcShapes(scene, portEnds);
    const after = arcShapes(
      withArcs({ input: { focus: "outgoing" }, output: { selected: true } }),
      portEnds,
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

  it("recompute the arcs of a moved node only, without changing the scene", () => {
    const snapshot = structuredClone(scene);
    const before = arcShapes(scene, portEnds);
    const computed = vi.spyOn(geometry, "arcGeometry");

    const after = arcShapes(
      withNodeAt("place", { x: -200, y: 100 }),
      portEnds,
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
    const before = arcShapes(scene, portEnds);
    const after = arcShapes(
      scene,
      new Map([
        ...portEnds,
        [
          "port-input",
          { source: fixedEndpoint(650, 60, Position.Right), target: null },
        ],
      ]),
      before,
    );

    expect(after.list[2]?.geometry.curve.start).toEqual({ x: 650, y: 60 });
    expect(after.list[3]).toBe(before.list[3]);
    expect(after.list[0]).toBe(before.list[0]);
  });

  it("take a new lane when an arc the other way appears", () => {
    const oneWay = { ...scene, arcs: scene.arcs.slice(0, 1) };
    const before = arcShapes(oneWay, portEnds);
    const after = arcShapes(
      { ...scene, arcs: scene.arcs.slice(0, 2) },
      portEnds,
      before,
    );

    expect(before.list[0]?.hasReverseArc).toBe(false);
    expect(after.list[0]?.hasReverseArc).toBe(true);
    expect(after.list[0]?.paths.curve).not.toBe(before.list[0]?.paths.curve);
  });
});

describe("the pairs of nodes a line joins", () => {
  it("says whether a line runs from one node to another, in that direction", () => {
    const joined = joinedPairs(scene.arcs);

    expect(joined("place", "transition")).toBe(true);
    expect(joined("transition", "place")).toBe(true);
    expect(joined("component", "transition")).toBe(true);
    expect(joined("place", "component")).toBe(false);
    expect(joinedPairs(scene.arcs.slice(0, 1))("transition", "place")).toBe(
      false,
    );
  });
});
