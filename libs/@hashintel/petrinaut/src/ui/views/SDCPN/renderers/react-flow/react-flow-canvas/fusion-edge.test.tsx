/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { type EdgeProps, Position } from "@xyflow/react";
import { afterEach, expect, it, vi } from "vitest";

import { FusionEdge } from "./fusion-edge";

import type { FusionEdgeType } from "./react-flow-types";

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  BaseEdge: ({ path, className }: { path: string; className?: string }) => (
    <path d={path} className={className} />
  ),
  useInternalNode: () => undefined,
}));

afterEach(cleanup);

const edgeProps = {
  id: "link",
  source: "stage",
  target: "buffer",
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  data: { fusionId: "fusion", name: "Buffer", focus: "none", severity: null },
} as unknown as EdgeProps<FusionEdgeType>;

it("draws the knot in a group that fades whole when the canvas focuses elsewhere", () => {
  const { container } = render(
    <svg>
      <FusionEdge {...edgeProps} />
    </svg>,
  );

  const knot = container.querySelector("circle");
  expect(knot).not.toBeNull();
  expect(knot?.closest(".arc-strokes")).not.toBeNull();
});

it("leaves the line out of that group, to fade by its stroke", () => {
  const { container } = render(
    <svg>
      <FusionEdge {...edgeProps} />
    </svg>,
  );

  const line = container.querySelector(".arc-line");
  expect(line).not.toBeNull();
  expect(line?.closest(".arc-strokes")).toBeNull();
});
