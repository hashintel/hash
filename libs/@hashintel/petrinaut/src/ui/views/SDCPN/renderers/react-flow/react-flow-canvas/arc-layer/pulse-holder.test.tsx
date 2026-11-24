/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { arcBase, nodes } from "../scene.test-helpers";
import { ArcRunStrokes } from "./arc-run-strokes";
import { arcRuns, arcsPerRun } from "./arc-runs";
import { arcShapes } from "./arc-shapes";
import { pulseHolderOf } from "./pulse-holder";

import type { CanvasArc, CanvasNode } from "../../../../canvas-scene";

it("is the holder of the arc's own run for an arc at rest", () => {
  // One arc more than a run holds, out of one transition to a place each.
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
  const [first, second] = runs?.children ?? [];

  expect(holderOf(0)).toBe(first?.firstElementChild);
  expect(holderOf(arcsPerRun - 1)).toBe(first?.firstElementChild);
  expect(holderOf(arcsPerRun)).toBe(second?.firstElementChild);
  expect(holderOf(arcsPerRun)?.getAttribute("class")).toBe("arc-pulses");
  expect(second?.firstElementChild).not.toBe(first?.firstElementChild);
});
