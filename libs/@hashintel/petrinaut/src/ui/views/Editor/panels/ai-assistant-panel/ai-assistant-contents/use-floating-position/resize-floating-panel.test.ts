import { describe, expect, test } from "vitest";

import { resizeFloatingPanel } from "./resize-floating-panel";

import type { ResizableEdge } from "../../../../../../resize/resize-handle";

const bounds = {
  right: 100,
  top: 100,
  width: 420,
  height: 500,
  parentWidth: 1000,
  parentHeight: 800,
};

describe("resizeFloatingPanel", () => {
  test.each([
    { edge: "left", delta: -60, right: 100, top: 100, width: 480, height: 500 },
    { edge: "right", delta: 60, right: 40, top: 100, width: 480, height: 500 },
    { edge: "top", delta: -60, right: 100, top: 40, width: 420, height: 560 },
    {
      edge: "bottom",
      delta: 60,
      right: 100,
      top: 100,
      width: 420,
      height: 560,
    },
  ] satisfies {
    edge: ResizableEdge;
    delta: number;
    right: number;
    top: number;
    width: number;
    height: number;
  }[])(
    "grows from $edge while keeping the opposite edge fixed",
    ({ edge, delta, ...expected }) => {
      expect(resizeFloatingPanel(bounds, edge, delta)).toEqual(expected);
    },
  );

  test.each([
    {
      edge: "left",
      delta: 1000,
      right: 100,
      top: 100,
      width: 320,
      height: 500,
    },
    {
      edge: "right",
      delta: -1000,
      right: 200,
      top: 100,
      width: 320,
      height: 500,
    },
    { edge: "top", delta: 1000, right: 100, top: 280, width: 420, height: 320 },
    {
      edge: "bottom",
      delta: -1000,
      right: 100,
      top: 100,
      width: 420,
      height: 320,
    },
  ] satisfies {
    edge: ResizableEdge;
    delta: number;
    right: number;
    top: number;
    width: number;
    height: number;
  }[])(
    "stops at the minimum size from $edge without moving the opposite edge",
    ({ edge, delta, ...expected }) => {
      expect(resizeFloatingPanel(bounds, edge, delta)).toEqual(expected);
    },
  );

  test.each([
    {
      edge: "left",
      delta: -1000,
      right: 100,
      top: 100,
      width: 720,
      height: 500,
    },
    {
      edge: "right",
      delta: 1000,
      right: 12,
      top: 100,
      width: 508,
      height: 500,
    },
    { edge: "top", delta: -1000, right: 100, top: 12, width: 420, height: 588 },
    {
      edge: "bottom",
      delta: 1000,
      right: 100,
      top: 100,
      width: 420,
      height: 688,
    },
  ] satisfies {
    edge: ResizableEdge;
    delta: number;
    right: number;
    top: number;
    width: number;
    height: number;
  }[])(
    "respects the editor bounds and maximum width from $edge",
    ({ edge, delta, ...expected }) => {
      expect(resizeFloatingPanel(bounds, edge, delta)).toEqual(expected);
    },
  );

  test.each(["left", "right", "top", "bottom"] as const)(
    "fits a small editor when resizing from %s",
    (edge) => {
      const smallBounds = {
        right: 12,
        top: 12,
        width: 256,
        height: 276,
        parentWidth: 280,
        parentHeight: 300,
      };
      for (const delta of [-1000, 1000]) {
        expect(resizeFloatingPanel(smallBounds, edge, delta)).toEqual({
          right: 12,
          top: 12,
          width: 256,
          height: 276,
        });
      }
    },
  );
});
