/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { withArcs } from "../scene.test-helpers";
import { ArcRunStrokes } from "./arc-run-strokes";
import { arcShapes } from "./arc-shapes";

import type { ArcRun } from "./arc-runs";

afterEach(cleanup);

/** The arc of the test scene that draws its own strokes here: it has a role. */
const own = arcShapes(
  withArcs({ output: { focus: "incoming" } }),
  new Map(),
  new Set(),
).list.filter((shape) => shape.alone);

const run: ArcRun = {
  members: [],
  own,
  strokes: [
    { color: "#111111", shafts: "M0,0L1,1", lines: "M0,0L2,2", heads: "M2,2Z" },
    { color: "#222222", shafts: "M5,5L6,6", lines: "M5,5L7,7", heads: "M7,7Z" },
  ],
};

const renderRun = () => {
  const { container } = render(
    <svg>
      <ArcRunStrokes run={run} />
    </svg>,
  );
  const group = container.querySelector(".arc-run");
  if (!group) {
    throw new Error("a run is one group");
  }
  return group;
};

it("draws each colour's lines up to their heads, the lines again, and all heads above all lines", () => {
  const group = renderRun();

  expect(
    [...group.children].map((child) => [
      child.getAttribute("class"),
      child.getAttribute("stroke") ?? child.getAttribute("fill"),
      child.getAttribute("d"),
    ]),
  ).toEqual([
    ["arc-pulses", null, null],
    ["arc-shaft", "#111111", "M0,0L1,1"],
    ["arc-line", "#111111", "M0,0L2,2"],
    ["arc-shaft", "#222222", "M5,5L6,6"],
    ["arc-line", "#222222", "M5,5L7,7"],
    ["arc-head", "#111111", "M2,2Z"],
    ["arc-head", "#222222", "M7,7Z"],
    ["arc-own canvas-focus-role", null, null],
  ]);
});

it("draws the strokes of the arcs that draw their own above the merged ones, in order", () => {
  const group = renderRun();
  const groups = [...group.querySelectorAll(":scope > .arc-own")];

  expect(groups.map((strokes) => strokes.getAttribute("data-arc"))).toEqual([
    "output",
  ]);
  expect(groups[0]?.previousElementSibling?.getAttribute("class")).toBe(
    "arc-head",
  );
});

it("keeps a place for the pulses of its arcs under their lines", () => {
  const group = renderRun();
  expect(group.firstElementChild?.getAttribute("class")).toBe("arc-pulses");
});

it("takes no pointer, with all it holds: each arc has an element of its own for that", () => {
  const group = renderRun();

  expect(group.getAttribute("pointer-events")).toBe("none");
  // Nothing inside turns the pointer back on.
  for (const element of group.querySelectorAll("*")) {
    expect(element.getAttribute("pointer-events") ?? "none").toBe("none");
  }
});

it("puts no group around the merged paths, for the pane to fade stroke by stroke", () => {
  const group = renderRun();
  for (const path of group.querySelectorAll(
    ":scope > .arc-shaft, :scope > .arc-line, :scope > .arc-head",
  )) {
    expect(path.getAttribute("opacity")).toBeNull();
  }
  expect(group.querySelectorAll(":scope > path")).toHaveLength(6);
});
