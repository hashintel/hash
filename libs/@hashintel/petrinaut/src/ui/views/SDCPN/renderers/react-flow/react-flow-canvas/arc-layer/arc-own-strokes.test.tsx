/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { withArcs } from "../scene.test-helpers";
import { ArcOwnStrokes } from "./arc-own-strokes";
import { arcShapes } from "./arc-shapes";

import type { CanvasArc } from "../../../../canvas-scene";

afterEach(cleanup);

/** The strokes of the scene's arc from the place to the transition. */
const renderStrokes = (arc: Partial<CanvasArc> = {}) => {
  const [shape] = arcShapes(withArcs({ input: arc }), new Map()).list;
  if (!shape) {
    throw new Error("the scene has an arc between two nodes");
  }
  const { container } = render(
    <svg>
      <ArcOwnStrokes shape={shape} />
    </svg>,
  );
  const group = container.querySelector(".arc-own");
  if (!group) {
    throw new Error("the strokes of an arc are one group");
  }
  return { group, shape };
};

describe("the strokes of a standard arc", () => {
  it("are a line up to the head, the whole line again, and the head", () => {
    const { group, shape } = renderStrokes();
    const shaft = group.querySelector(".arc-shaft");
    const twin = group.querySelector(".arc-line-twin");
    const head = group.querySelector(".arc-head");

    expect(shaft?.getAttribute("d")).toBe(shape.paths.shaft);
    expect(twin?.getAttribute("d")).toBe(shape.paths.curve);
    expect(head?.getAttribute("d")).toBe(shape.paths.head);
    expect(shaft?.getAttribute("stroke")).toBe("#123456");
    expect(head?.getAttribute("fill")).toBe("#123456");
    // The pane fades the three as children of the group, each by an opacity
    // of its own: an opacity on the group would be a buffer per arc.
    for (const stroke of [shaft, twin, head]) {
      expect(stroke?.parentElement).toBe(group);
    }
    expect(group.classList.contains("arc-strokes")).toBe(false);
  });

  it("are named after their arc", () => {
    expect(renderStrokes().group.getAttribute("data-arc")).toBe("input");
  });

  it("keep a place for the arc's pulse under its line", () => {
    const { group } = renderStrokes();
    const holder = group.querySelector(".arc-pulses");

    expect(holder?.parentElement).toBe(group);
    expect(holder?.nextElementSibling).toBe(group.querySelector(".arc-shaft"));
  });

  it("wear the casing of the arc's role, and a head of the casing's colour", () => {
    const plain = renderStrokes().group;
    expect(plain.classList.contains("canvas-focus-role")).toBe(false);
    cleanup();

    const { group } = renderStrokes({ focus: "incoming" });
    const widths = [...group.querySelectorAll("path")].map((path) =>
      path.getAttribute("stroke-width"),
    );
    const casing = group.querySelector('path[stroke-width="10"]');

    expect(group.classList.contains("canvas-focus-role")).toBe(true);
    // The role's colour 10 wide, white 6 wide, then the arc's own strokes.
    expect(widths.slice(0, 4)).toEqual(["10", "6", "2", "2"]);
    expect(group.querySelector(".arc-head")?.getAttribute("fill")).toBe(
      casing?.getAttribute("stroke"),
    );
    expect(casing?.getAttribute("stroke")).not.toBe("#123456");
  });

  it("wear a band under everything while the arc is selected", () => {
    const { group } = renderStrokes({ selected: true });
    expect(group.firstElementChild?.getAttribute("stroke-width")).toBe("8");
  });
});

describe("the strokes of an arc with marks on its line", () => {
  it.each(["inhibitor", "read"] as const)(
    "are one group for a %s arc, which the pane fades with its mark",
    (kind) => {
      const { group, shape } = renderStrokes({ kind, focus: "incoming" });
      const mark = group.querySelector("circle");
      const { end } = shape.geometry.curve;

      expect(group.classList.contains("arc-strokes")).toBe(true);
      expect(
        group.querySelector(".arc-shaft, .arc-line-twin, .arc-head"),
      ).toBeNull();
      // Casing, pulse, line and mark are children of the group. The mark
      // sits on the line a little before its end.
      expect(group.querySelector('path[stroke-width="10"]')).not.toBeNull();
      expect(group.querySelector(":scope > .arc-pulses")).not.toBeNull();
      expect(
        Math.hypot(
          Number(mark?.getAttribute("cx")) - end.x,
          Number(mark?.getAttribute("cy")) - end.y,
        ),
      ).toBeCloseTo(kind === "read" ? 2 : 8);
      expect(mark?.getAttribute("r")).toBe(kind === "read" ? "4" : "10");
      expect(mark?.parentElement).toBe(group);
    },
  );

  it("dot the line and the casing of a read arc", () => {
    const { group } = renderStrokes({ kind: "read", focus: "incoming" });
    const dashes = [...group.querySelectorAll(":scope > path")].map((path) =>
      path.getAttribute("stroke-dasharray"),
    );

    expect(dashes).toEqual(["2 6", "2 6", "2 6", "2 6"]);
  });

  it("fill the circle of an inhibitor arc white, over its line", () => {
    const { group } = renderStrokes({ kind: "inhibitor" });
    const circle = group.querySelector("circle");

    expect(circle?.getAttribute("fill")).toBe("white");
    expect(circle?.getAttribute("stroke")).toBe("#123456");
    expect(circle?.previousElementSibling?.tagName).toBe("path");
  });
});
