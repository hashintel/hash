/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { withArcs } from "../scene.test-helpers";
import { ArcItem } from "./arc-item";
import { arcShapes } from "./arc-shapes";

import type { CanvasArc } from "../../../../canvas-scene";

afterEach(cleanup);

/** The element of the scene's arc from the place to the transition. */
const renderArc = (arc: Partial<CanvasArc> = {}, selectable = true) => {
  const [shape] = arcShapes(withArcs({ input: arc }), new Map()).list;
  if (!shape) {
    throw new Error("the scene has an arc between two nodes");
  }
  const { container } = render(
    <svg>
      <ArcItem shape={shape} selectable={selectable} describedBy="edges" />
    </svg>,
  );
  const item = container.querySelector(".arc-item");
  if (!item) {
    throw new Error("an arc is one element");
  }
  return { item, shape };
};

describe("what an arc draws", () => {
  it("is a line up to the head, the whole line again, and the head, with no group around them", () => {
    const { item, shape } = renderArc();
    const shaft = item.querySelector(".arc-shaft");
    const twin = item.querySelector(".arc-line-twin");
    const head = item.querySelector(".arc-head");

    expect(shaft?.getAttribute("d")).toBe(shape.paths.shaft);
    expect(twin?.getAttribute("d")).toBe(shape.paths.curve);
    expect(head?.getAttribute("d")).toBe(shape.paths.head);
    expect(shaft?.getAttribute("stroke")).toBe("#123456");
    expect(head?.getAttribute("fill")).toBe("#123456");
    // The pane fades the three as children of the arc's own element. An
    // opacity on a group around them would be a buffer per arc.
    for (const stroke of [shaft, twin, head]) {
      expect(stroke?.parentElement).toBe(item);
    }
    expect(item.querySelector(".arc-strokes")).toBeNull();
  });

  it("keeps a place for its pulse under its line", () => {
    const { item } = renderArc();
    const slot = item.querySelector(".arc-pulses");

    expect(slot?.parentElement).toBe(item);
    expect(slot?.nextElementSibling).toBe(item.querySelector(".arc-shaft"));
  });

  it("wears the casing of its role, and a head of the casing's colour", () => {
    const plain = renderArc().item;
    expect(plain.classList.contains("canvas-focus-role")).toBe(false);
    cleanup();

    const { item } = renderArc({ focus: "incoming" });
    const widths = [...item.querySelectorAll("path")].map((path) =>
      path.getAttribute("stroke-width"),
    );
    const casing = item.querySelector('path[stroke-width="10"]');

    expect(item.classList.contains("canvas-focus-role")).toBe(true);
    // The role's colour 10 wide, white 6 wide, then the arc's own strokes.
    expect(widths.slice(0, 4)).toEqual(["10", "6", "2", "2"]);
    expect(item.querySelector(".arc-head")?.getAttribute("fill")).toBe(
      casing?.getAttribute("stroke"),
    );
    expect(casing?.getAttribute("stroke")).not.toBe("#123456");
  });

  it("wears a band while it is selected, and says so", () => {
    const { item } = renderArc({ selected: true });

    expect(item.classList.contains("selected")).toBe(true);
    expect(item.firstElementChild?.getAttribute("stroke-width")).toBe("8");
  });

  it("shows a weight above 1, at the middle of its curve", () => {
    expect(renderArc().item.querySelector("text")).toBeNull();
    cleanup();

    const { item, shape } = renderArc({ weight: 4 });
    expect(item.textContent).toBe("×4");
    expect(item.lastElementChild?.getAttribute("transform")).toBe(
      `translate(${shape.geometry.label.x}, ${shape.geometry.label.y})`,
    );
  });

  it.each(["inhibitor", "read"] as const)(
    "draws a %s arc in one group, which the pane fades with its mark",
    (kind) => {
      const { item, shape } = renderArc({ kind, focus: "incoming" });
      const group = item.querySelector(".arc-strokes");
      const mark = group?.querySelector("circle");
      const { end } = shape.geometry.curve;

      expect(group?.parentElement).toBe(item);
      expect(
        item.querySelector(".arc-shaft, .arc-line-twin, .arc-head"),
      ).toBeNull();
      // Casing, pulse and line are in the group, and so is the mark, which
      // sits on the line a little before its end.
      expect(group?.querySelector('path[stroke-width="10"]')).not.toBeNull();
      expect(group?.querySelector(".arc-pulses")).not.toBeNull();
      expect(
        Math.hypot(
          Number(mark?.getAttribute("cx")) - end.x,
          Number(mark?.getAttribute("cy")) - end.y,
        ),
      ).toBeCloseTo(kind === "read" ? 2 : 8);
      expect(mark?.getAttribute("r")).toBe(kind === "read" ? "4" : "10");
      // The weight stays outside: it is read on a faded arc too.
      expect(item.lastElementChild).not.toBe(group);
    },
  );

  it("dots the line and the casing of a read arc", () => {
    const { item } = renderArc({ kind: "read", focus: "incoming" });
    const dashes = [...item.querySelectorAll(".arc-strokes > path")].map(
      (path) => path.getAttribute("stroke-dasharray"),
    );

    expect(dashes).toEqual(["2 6", "2 6", "2 6", "2 6"]);
  });
});

describe("what of an arc takes the pointer", () => {
  it("is its curve, 20 wide and not painted, as the last path of its element", () => {
    const { item, shape } = renderArc({ weight: 2 });
    const band = item.querySelector(".react-flow__edge-interaction");

    expect(band?.getAttribute("d")).toBe(shape.paths.curve);
    expect(band?.getAttribute("stroke-width")).toBe("20");
    expect(band?.getAttribute("stroke-opacity")).toBe("0");
    expect([...item.querySelectorAll("path")].at(-1)).toBe(band);
    expect(band?.getAttribute("pointer-events")).toBeNull();
  });

  it.each(["standard", "inhibitor", "read"] as const)(
    "is nothing that a %s arc paints",
    (kind) => {
      const { item } = renderArc({ kind, focus: "focused", selected: true });
      const painted = [...item.querySelectorAll("path, circle, line")].filter(
        (element) =>
          !element.classList.contains("react-flow__edge-interaction"),
      );

      expect(painted.length).toBeGreaterThan(4);
      for (const element of painted) {
        expect(element.getAttribute("pointer-events")).toBe("none");
      }
    },
  );
});

describe("the element of an arc", () => {
  it("takes the focus, with the name and the classes of an edge of React Flow", () => {
    const { item } = renderArc();

    expect(item.getAttribute("tabindex")).toBe("0");
    expect(item.getAttribute("role")).toBe("group");
    expect(item.getAttribute("aria-roledescription")).toBe("edge");
    expect(item.getAttribute("aria-label")).toBe(
      "Edge from place to transition",
    );
    expect(item.getAttribute("aria-describedby")).toBe("edges");
    expect(item.getAttribute("data-id")).toBe("input");
    expect(item.getAttribute("data-testid")).toBe("rf__edge-input");
    expect([...item.classList]).toEqual([
      "arc-item",
      "react-flow__edge",
      "react-flow__edge-default",
      "nopan",
      "selectable",
    ]);
  });

  it("is not marked as something to pick while a node is being added", () => {
    const { item } = renderArc({}, false);
    expect(item.classList.contains("selectable")).toBe(false);
  });
});
