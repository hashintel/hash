/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { type EdgeProps, Position, ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import { Arc } from "./arc";

import type { ArcData, ArcEdgeType } from "./react-flow-types";

afterEach(cleanup);

const renderArc = (kind: ArcData["kind"]) => {
  const props = {
    id: "arc",
    source: "place",
    target: "transition",
    // A straight run of 200, so the head's share of it is a round number.
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    markerEnd: "url('#head')",
    style: { stroke: "#123456", strokeWidth: 2 },
    data: {
      kind,
      weight: 1,
      focus: "none",
      transitionId: "transition",
      sourceOutline: null,
      targetOutline: null,
      hasReverseArc: false,
    },
  } as unknown as EdgeProps<ArcEdgeType>;
  const { container } = render(
    <ReactFlowProvider>
      <svg>
        <Arc {...props} />
      </svg>
    </ReactFlowProvider>,
  );
  return container;
};

describe("how the pane can fade an arc", () => {
  it("gives a standard arc no group that fades whole", () => {
    const container = renderArc("standard");

    // An opacity on an element every arc has is a buffer per arc.
    expect(container.querySelector(".arc-strokes")).toBeNull();
  });

  it("marks the two strokes of a standard arc, the second on the edge that wears the head", () => {
    const container = renderArc("standard");

    const line = container.querySelector(".arc-line");
    const twin = container.querySelector(".arc-line-twin");
    expect(line?.getAttribute("marker-end")).toBeNull();
    expect(twin?.getAttribute("marker-end")).toBe("url('#head')");
    expect(twin?.classList.contains("react-flow__edge-path")).toBe(true);
    expect(line?.getAttribute("d")).toBe(twin?.getAttribute("d"));
  });

  it("says where a faded line stops, as the share of the path before the head", () => {
    const container = renderArc("standard");

    // The head is 5.5 stroke widths of 2 long, on a path 200 long.
    const line = container.querySelector<SVGPathElement>(".arc-line");
    expect(line?.getAttribute("pathLength")).toBe("1");
    const [drawn, gap] = (
      line?.style.getPropertyValue("--arc-faded-dash") ?? ""
    )
      .split(" ")
      .map(Number);
    expect(drawn).toBeCloseTo(1 - 11 / 200);
    expect(gap).toBe(1);
  });

  it.each(["inhibitor", "read"] as const)(
    "fades a %s arc as one group, with its mark",
    (kind) => {
      const container = renderArc(kind);

      const group = container.querySelector(".arc-strokes");
      expect(group).not.toBeNull();
      expect(group?.querySelector(".react-flow__edge-path")).not.toBeNull();
      expect(container.querySelector(".arc-line, .arc-line-twin")).toBeNull();
      // Its own dashes keep the units they were written in.
      expect(container.querySelector("[pathLength]")).toBeNull();
    },
  );
});
