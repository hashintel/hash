/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { arcBase, nodes } from "../scene.test-helpers";
import { ArcRunStrokes } from "./arc-run-strokes";
import { arcRuns, arcsPerRun } from "./arc-runs";
import { arcShapes } from "./arc-shapes";
import { pulseHolderOf } from "./pulse-holder";

import type { CanvasArc, CanvasNode } from "../../../../canvas-scene";

afterEach(cleanup);

/**
 * A net of one arc more than a run holds, out of one transition to a place
 * each. The arcs named in `own` have a focus role, so they draw their own
 * strokes.
 */
const mount = (own: number[]) => {
  const [place, transition] = nodes;
  if (place?.kind !== "place" || !transition) {
    throw new Error("the test scene starts with a place and a transition");
  }
  const places: CanvasNode[] = Array.from(
    { length: arcsPerRun + 1 },
    (_, index) => ({
      ...place,
      id: `place-${index}`,
      position: { x: 600, y: index * 120 },
    }),
  );
  const arcs: CanvasArc[] = places.map((target, index) => ({
    ...arcBase,
    id: `arc-${index}`,
    sourceId: "transition",
    targetId: target.id,
    focus: own.includes(index) ? "outgoing" : "none",
  }));
  const shapes = arcShapes(
    { nodes: [transition, ...places], arcs },
    new Map(),
    new Set(),
  ).list;
  const { container } = render(
    <svg>
      <g className="arc-runs">
        {arcRuns(shapes).map((run, index) => (
          // eslint-disable-next-line react/no-array-index-key -- a run is its place among the runs
          <ArcRunStrokes key={index} run={run} />
        ))}
      </g>
    </svg>,
  );
  const runs = container.querySelector(".arc-runs");
  const holderOf = (index: number) => {
    const shape = shapes[index];
    if (!shape) {
      throw new Error(`no arc ${index}`);
    }
    return pulseHolderOf(runs, shape, index);
  };
  return { runs, holderOf, shapes };
};

it("is the holder of the arc's own run for an arc at rest", () => {
  const { runs, holderOf } = mount([]);
  const [first, second] = runs?.children ?? [];

  expect(holderOf(0)).toBe(first?.firstElementChild);
  expect(holderOf(arcsPerRun - 1)).toBe(first?.firstElementChild);
  expect(holderOf(arcsPerRun)).toBe(second?.firstElementChild);
  expect(holderOf(arcsPerRun)?.getAttribute("class")).toBe("arc-pulses");
  expect(second?.firstElementChild).not.toBe(first?.firstElementChild);
});

it("is the holder among the arc's own strokes for an arc that draws them", () => {
  const { runs, holderOf } = mount([1, arcsPerRun]);

  for (const index of [1, arcsPerRun]) {
    const holder = holderOf(index);
    expect(holder?.getAttribute("class")).toBe("arc-pulses");
    expect(holder?.parentElement?.getAttribute("data-arc")).toBe(
      `arc-${index}`,
    );
  }
  // Its run still holds the pulses of the arcs at rest in its own holder.
  expect(holderOf(0)).toBe(runs?.children[0]?.firstElementChild);
});

it("is none for an arc the page does not draw", () => {
  const { shapes } = mount([]);
  const [shape] = shapes;
  if (!shape) {
    throw new Error("no arc");
  }

  expect(pulseHolderOf(null, shape, 0)).toBeNull();
  expect(
    pulseHolderOf(document.createElement("div"), shape, arcsPerRun),
  ).toBeNull();
  // An arc that draws its own strokes, where the page has it at rest.
  const { runs } = mount([]);
  expect(pulseHolderOf(runs, { id: shape.id, alone: true }, 0)).toBeNull();
});
