import { describe, expect, test } from "vitest";

import {
  resizeFloatingPanel,
  type FloatingResizeDirection,
} from "./resize-floating-panel";

import type { ResizableEdge } from "../../../../resize/resize-handle";

const bounds = {
  right: 100,
  top: 100,
  width: 420,
  height: 500,
  parentWidth: 1000,
  parentHeight: 800,
};

describe("resizeFloatingPanel", () => {
  test("uses the settings window's size limits and viewport inset", () => {
    expect(
      resizeFloatingPanel(
        {
          ...bounds,
          width: 760,
          height: 480,
          parentWidth: 1200,
          parentHeight: 900,
        },
        "top-left",
        { x: 1000, y: 1000 },
        { minWidth: 520, minHeight: 320, maxWidth: Infinity, gap: 20 },
      ),
    ).toEqual({ right: 100, top: 260, width: 520, height: 320 });
    expect(
      resizeFloatingPanel(
        {
          ...bounds,
          width: 760,
          height: 480,
          parentWidth: 1200,
          parentHeight: 900,
        },
        "bottom-left",
        { x: -1000, y: 1000 },
        { minWidth: 520, minHeight: 320, maxWidth: Infinity, gap: 20 },
      ),
    ).toEqual({ right: 100, top: 100, width: 1080, height: 780 });
  });

  test.each([
    {
      direction: "top-left",
      delta: { x: -60, y: -40 },
      expected: { right: 100, top: 60, width: 480, height: 540 },
    },
    {
      direction: "top-right",
      delta: { x: 60, y: -40 },
      expected: { right: 40, top: 60, width: 480, height: 540 },
    },
    {
      direction: "bottom-left",
      delta: { x: -60, y: 40 },
      expected: { right: 100, top: 100, width: 480, height: 540 },
    },
    {
      direction: "bottom-right",
      delta: { x: 60, y: 40 },
      expected: { right: 40, top: 100, width: 480, height: 540 },
    },
  ] satisfies {
    direction: FloatingResizeDirection;
    delta: { x: number; y: number };
    expected: { right: number; top: number; width: number; height: number };
  }[])(
    "grows from $direction while keeping the opposite corner fixed",
    ({ direction, delta, expected }) => {
      expect(resizeFloatingPanel(bounds, direction, delta)).toEqual(expected);
    },
  );

  test.each([
    {
      direction: "top-left",
      delta: { x: 1000, y: 1000 },
      expected: { right: 100, top: 280, width: 320, height: 320 },
    },
    {
      direction: "top-right",
      delta: { x: -1000, y: 1000 },
      expected: { right: 200, top: 280, width: 320, height: 320 },
    },
    {
      direction: "bottom-left",
      delta: { x: 1000, y: -1000 },
      expected: { right: 100, top: 100, width: 320, height: 320 },
    },
    {
      direction: "bottom-right",
      delta: { x: -1000, y: -1000 },
      expected: { right: 200, top: 100, width: 320, height: 320 },
    },
  ] satisfies {
    direction: FloatingResizeDirection;
    delta: { x: number; y: number };
    expected: { right: number; top: number; width: number; height: number };
  }[])(
    "stops at the minimum size from $direction without moving the opposite corner",
    ({ direction, delta, expected }) => {
      expect(resizeFloatingPanel(bounds, direction, delta)).toEqual(expected);
    },
  );

  test.each([
    {
      direction: "top-left",
      delta: { x: -1000, y: -1000 },
      expected: { right: 100, top: 12, width: 720, height: 588 },
    },
    {
      direction: "top-right",
      delta: { x: 1000, y: -1000 },
      expected: { right: 12, top: 12, width: 508, height: 588 },
    },
    {
      direction: "bottom-left",
      delta: { x: -1000, y: 1000 },
      expected: { right: 100, top: 100, width: 720, height: 688 },
    },
    {
      direction: "bottom-right",
      delta: { x: 1000, y: 1000 },
      expected: { right: 12, top: 100, width: 508, height: 688 },
    },
  ] satisfies {
    direction: FloatingResizeDirection;
    delta: { x: number; y: number };
    expected: { right: number; top: number; width: number; height: number };
  }[])(
    "respects the editor bounds and maximum width from $direction",
    ({ direction, delta, expected }) => {
      expect(resizeFloatingPanel(bounds, direction, delta)).toEqual(expected);
    },
  );

  test("keeps resizing vertically after reaching the minimum width", () => {
    expect(
      resizeFloatingPanel(bounds, "bottom-right", { x: -1000, y: 40 }),
    ).toEqual({
      right: 200,
      top: 100,
      width: 320,
      height: 540,
    });
  });

  test("keeps resizing horizontally after reaching the top editor boundary", () => {
    expect(
      resizeFloatingPanel(bounds, "top-left", { x: 40, y: -1000 }),
    ).toEqual({
      right: 100,
      top: 12,
      width: 380,
      height: 588,
    });
  });

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
      expect(resizeFloatingPanel(bounds, edge, { x: delta, y: delta })).toEqual(
        expected,
      );
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
      expect(resizeFloatingPanel(bounds, edge, { x: delta, y: delta })).toEqual(
        expected,
      );
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
      expect(resizeFloatingPanel(bounds, edge, { x: delta, y: delta })).toEqual(
        expected,
      );
    },
  );

  test.each([
    "left",
    "right",
    "top",
    "bottom",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ] as const)("fits a small editor when resizing from %s", (edge) => {
    const smallBounds = {
      right: 12,
      top: 12,
      width: 256,
      height: 276,
      parentWidth: 280,
      parentHeight: 300,
    };
    for (const delta of [-1000, 1000]) {
      expect(
        resizeFloatingPanel(smallBounds, edge, { x: delta, y: delta }),
      ).toEqual({
        right: 12,
        top: 12,
        width: 256,
        height: 276,
      });
    }
  });
});
