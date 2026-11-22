import { describe, expect, it } from "vitest";

import { arcBase, nodes } from "../scene.test-helpers";
import { arcRuns, arcsPerRun } from "./arc-runs";
import { type ArcShape, arcShapes } from "./arc-shapes";

import type { CanvasArc, CanvasNode } from "../../../../canvas-scene";

const colors = ["#111111", "#222222", "#333333"];

/** A net of `count` arcs out of one transition, to a place each, in three colours. */
const sceneOf = (
  count: number,
  changes: Record<number, Partial<CanvasArc>> = {},
) => {
  const [place, transition] = nodes;
  if (place?.kind !== "place" || !transition) {
    throw new Error("the test scene starts with a place and a transition");
  }
  const places: CanvasNode[] = Array.from({ length: count }, (_, index) => ({
    ...place,
    id: `place-${index}`,
    position: { x: 600, y: index * 120 },
  }));
  const arcs: CanvasArc[] = places.map((target, index) => ({
    ...arcBase,
    id: `arc-${index}`,
    sourceId: "transition",
    targetId: target.id,
    color: colors[index % colors.length] ?? "#000000",
    ...changes[index],
  }));
  return { nodes: [transition, ...places], arcs };
};

const shapesOf = (
  count: number,
  changes: Record<number, Partial<CanvasArc>> = {},
  previous?: ReturnType<typeof arcShapes>,
) => arcShapes(sceneOf(count, changes), new Map(), undefined, previous);

const subpaths = (path: string) => (path.match(/M/g) ?? []).length;

/** How often each arc is drawn by the runs: once per subpath that is its own. */
const timesDrawn = (shapes: readonly ArcShape[]) => {
  const runs = arcRuns(shapes);
  return shapes.map((shape, index) => {
    const run = runs[Math.floor(index / arcsPerRun)];
    const strokes = run?.strokes.find(({ color }) => color === shape.color);
    return {
      shafts: strokes?.shafts.split(shape.paths.shaft).length ?? 1,
      lines: strokes?.lines.split(shape.paths.curve).length ?? 1,
      heads: strokes?.heads.split(shape.paths.head).length ?? 1,
    };
  });
};

describe("the runs of a scene's arcs", () => {
  it("cut the arcs into runs of consecutive arcs, in the order of the scene", () => {
    const { list } = shapesOf(arcsPerRun * 2 + 5);
    const runs = arcRuns(list);

    expect(runs.map((run) => run.members.length)).toEqual([
      arcsPerRun,
      arcsPerRun,
      5,
    ]);
    expect(runs[1]?.members[0]).toBe(list[arcsPerRun]);
    expect(runs[2]?.members.at(-1)).toBe(list.at(-1));
  });

  it("draw the arcs of one colour in one path each for shafts, lines and heads", () => {
    const { list } = shapesOf(10);
    const [run] = arcRuns(list);

    // Colours in the order each first appears.
    expect(run?.strokes.map(({ color }) => color)).toEqual(colors);
    expect(run?.strokes.map(({ shafts }) => subpaths(shafts))).toEqual([
      4, 3, 3,
    ]);
    expect(run?.strokes[0]?.lines).toBe(
      [0, 3, 6, 9].map((index) => list[index]?.paths.curve).join(""),
    );
    expect(run?.strokes[1]?.heads).toBe(
      [1, 4, 7].map((index) => list[index]?.paths.head).join(""),
    );
  });

  it("draw every arc at rest exactly once, and no arc that draws its own strokes", () => {
    const { list } = shapesOf(arcsPerRun + 20, {
      3: { focus: "incoming" },
      4: { selected: true, focus: "focused" },
      70: { kind: "read" },
    });

    for (const [index, drawn] of timesDrawn(list).entries()) {
      // `split` gives one piece more than the times the path occurs.
      const times = [3, 4, 70].includes(index) ? 1 : 2;
      expect(drawn).toEqual({ shafts: times, lines: times, heads: times });
    }
    const runs = arcRuns(list);
    expect(runs.reduce((count, run) => count + run.members.length, 0)).toBe(
      arcsPerRun + 20 - 3,
    );
    expect(
      runs
        .flatMap((run) => run.strokes)
        .reduce((count, strokes) => count + subpaths(strokes.shafts), 0),
    ).toBe(arcsPerRun + 20 - 3);
  });

  it("keep a run in the list, without strokes, when all its arcs draw their own", () => {
    const { list } = shapesOf(
      arcsPerRun + 1,
      Object.fromEntries(
        Array.from({ length: arcsPerRun }, (_, index) => [
          index,
          { focus: "outgoing" as const },
        ]),
      ),
    );
    const runs = arcRuns(list);

    // The place of a run among the runs says which arcs it holds.
    expect(runs).toHaveLength(2);
    expect(runs[0]?.strokes).toEqual([]);
    expect(runs[0]?.own).toHaveLength(arcsPerRun);
    expect(runs[1]?.members).toHaveLength(1);
  });
});

describe("the runs of the scene after", () => {
  it("are the same list when no arc at rest changed", () => {
    const shapes = shapesOf(arcsPerRun + 20);
    const runs = arcRuns(shapes.list);

    expect(arcRuns(shapesOf(arcsPerRun + 20, {}, shapes).list, runs)).toBe(
      runs,
    );
  });

  it("write again only the runs that hold a changed arc", () => {
    const shapes = shapesOf(arcsPerRun * 3);
    const runs = arcRuns(shapes.list);
    const after = arcRuns(
      shapesOf(
        arcsPerRun * 3,
        { [arcsPerRun + 2]: { focus: "incoming" } },
        shapes,
      ).list,
      runs,
    );

    expect(after[0]).toBe(runs[0]);
    expect(after[1]).not.toBe(runs[1]);
    expect(after[1]?.members).toHaveLength(arcsPerRun - 1);
    expect(after[2]).toBe(runs[2]);
  });

  it("keep the merged strokes of a run while one of its arcs that draws its own moves", () => {
    const moving = (y: number) => {
      const base = sceneOf(arcsPerRun + 4);
      return {
        ...base,
        nodes: base.nodes.map((node) =>
          node.id === "place-2"
            ? { ...node, position: { x: 600, y }, dragging: true }
            : node,
        ),
      };
    };
    const first = arcShapes(moving(300), new Map());
    const runs = arcRuns(first.list);
    const next = arcShapes(moving(340), new Map(), undefined, first);
    const after = arcRuns(next.list, runs);

    expect(next.list[2]).not.toBe(first.list[2]);
    // The run of the moved arc holds its new shape, and the strokes it had.
    expect(after[0]).not.toBe(runs[0]);
    expect(after[0]?.own).toEqual([next.list[2]]);
    expect(after[0]?.strokes).toBe(runs[0]?.strokes);
    expect(after[1]).toBe(runs[1]);
  });

  it("start a run for an arc added after a full one, which stays as it is", () => {
    const shapes = shapesOf(arcsPerRun);
    const runs = arcRuns(shapes.list);
    const { list } = shapesOf(arcsPerRun + 1, {}, shapes);

    const after = arcRuns(list, runs);
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(runs[0]);
    expect(after[1]?.members).toEqual([list.at(-1)]);
  });
});
