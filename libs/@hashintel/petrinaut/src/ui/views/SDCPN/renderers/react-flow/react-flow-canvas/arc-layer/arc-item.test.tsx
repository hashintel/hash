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
  const [shape] = arcShapes(
    withArcs({ input: arc }),
    new Map(),
    new Set(),
  ).list;
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

  it("says when its arc is selected or has a focus role", () => {
    const { item } = renderArc({ selected: true, focus: "focused" });

    expect(item.classList.contains("selected")).toBe(true);
    expect(item.classList.contains("canvas-focus-role")).toBe(true);
  });
});

describe("what of an arc takes the pointer", () => {
  it("is its curve, 20 wide and not painted", () => {
    const { item, shape } = renderArc();
    const band = item.querySelector(".react-flow__edge-interaction");

    expect(band?.getAttribute("d")).toBe(shape.paths.curve);
    expect(band?.getAttribute("stroke-width")).toBe("20");
    expect(band?.getAttribute("stroke-opacity")).toBe("0");
    expect(band?.getAttribute("fill")).toBe("none");
    expect(band?.getAttribute("pointer-events")).toBeNull();
  });

  it.each([
    {},
    { focus: "focused", selected: true },
    { kind: "read" },
  ] as const)(
    "is the only path of its element, whatever the arc draws: %j",
    (arc) => {
      const { item } = renderArc(arc);

      // The strokes of the arc are in its run, which takes no pointer.
      expect(
        [...item.children].map((child) => child.getAttribute("class")),
      ).toEqual(["react-flow__edge-interaction"]);
    },
  );
});

describe("the weight of an arc", () => {
  it("shows above 1, at the middle of the curve, inside the arc's element", () => {
    expect(renderArc().item.querySelector("text")).toBeNull();
    cleanup();

    const { item, shape } = renderArc({ weight: 4 });
    expect(item.textContent).toBe("×4");
    expect(item.lastElementChild?.getAttribute("transform")).toBe(
      `translate(${shape.geometry.label.x}, ${shape.geometry.label.y})`,
    );
  });
});
