/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PinnedVisualizer } from "./pinned-visualizer";

import type { ReactNode } from "react";

const canvas = vi.hoisted(() => ({
  node: {
    internals: { positionAbsolute: { x: 500, y: 400 } },
    measured: { width: 100, height: 80 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
}));

vi.mock("@xyflow/react", () => ({
  useInternalNode: () => canvas.node,
  useViewport: () => canvas.viewport,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 1200, height: 800 }),
  ViewportPortal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../../../../../hooks/use-canvas-insets", () => ({
  useCanvasInsets: () => ({ left: 200, right: 0, bottom: 0 }),
}));
vi.mock("@hashintel/ds-components", () => ({
  Button: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      Unpin
    </button>
  ),
}));

const panel = (onUnpin = () => {}) => (
  <PinnedVisualizer
    nodeId="place"
    name="Space"
    initialSize={{ width: 320, height: 240 }}
    onUnpin={onUnpin}
  >
    <svg viewBox="0 0 320 240" />
  </PinnedVisualizer>
);

const pointerEvent = (
  handle: Element,
  type: string,
  { clientX = 0, clientY = 0, pointerId = 1, button = 0, altKey = false } = {},
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    button,
    clientX,
    clientY,
    altKey,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(handle, event);
};

const mockPointerCapture = (handle: HTMLElement) => {
  const release = vi.fn();
  Object.defineProperties(handle, {
    setPointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
    releasePointerCapture: { value: release },
  });
  return release;
};

beforeEach(() => {
  canvas.node.internals.positionAbsolute = { x: 500, y: 400 };
  canvas.viewport = { x: 0, y: 0, zoom: 1 };
});
afterEach(cleanup);

it("keeps its Canvas position and screen size when the place or viewport moves, while updating the connector", () => {
  const { rerender, container } = render(panel());
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const initialBounds = [
    visualizer.style.left,
    visualizer.style.top,
    visualizer.style.width,
    visualizer.style.height,
  ];
  const initialConnector = container.querySelector("line")?.outerHTML;

  canvas.node.internals.positionAbsolute = { x: 750, y: 600 };
  canvas.viewport = { x: -100, y: 50, zoom: 0.5 };
  rerender(panel());

  expect([
    visualizer.style.left,
    visualizer.style.top,
    visualizer.style.width,
    visualizer.style.height,
  ]).toEqual(initialBounds);
  expect(visualizer.style.transform).toBe("scale(2)");
  expect(container.querySelector("line")?.outerHTML).not.toBe(initialConnector);
});

it("places the panel within the available canvas when the place is near the top edge", () => {
  canvas.node.internals.positionAbsolute = { x: 240, y: 80 };
  render(panel());
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  expect(parseFloat(visualizer.style.left)).toBeGreaterThanOrEqual(200);
  expect(parseFloat(visualizer.style.top)).toBeGreaterThanOrEqual(72);
  expect(parseFloat(visualizer.style.top)).toBeGreaterThanOrEqual(160);
});

it.each([0.5, 1, 2])(
  "moves and resizes in screen pixels at zoom %s without moving the attached place",
  (zoom) => {
    canvas.viewport.zoom = zoom;
    render(panel());
    const visualizer = screen.getByRole("group", {
      name: "Space state visualizer",
    });
    const initialLeft = parseFloat(visualizer.style.left);
    const initialWidth = parseFloat(visualizer.style.width);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Move Space visualizer" }),
      { key: "ArrowRight", shiftKey: true },
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Resize Space visualizer from bottom-right",
      }),
      { key: "ArrowRight" },
    );

    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 20 / zoom);
    expect(parseFloat(visualizer.style.width)).toBe(initialWidth + 5);
    expect(
      parseFloat(visualizer.style.width) / parseFloat(visualizer.style.height),
    ).toBeCloseTo(4 / 3);
    expect(initialWidth).toBe(320);
    expect(visualizer.style.transform).toBe(`scale(${1 / zoom})`);
    expect(canvas.node.internals.positionAbsolute).toEqual({ x: 500, y: 400 });
  },
);

it("preserves the aspect ratio when dragging the shared corner resizer at reduced zoom", () => {
  canvas.viewport.zoom = 0.5;
  render(panel());
  const handle = screen.getByRole("button", {
    name: "Resize Space visualizer from bottom-right",
  });
  mockPointerCapture(handle);
  pointerEvent(handle, "pointerdown");
  pointerEvent(handle, "pointermove", { clientX: 80, clientY: 10 });
  pointerEvent(handle, "pointerup", { clientX: 80, clientY: 10 });
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  expect(parseFloat(visualizer.style.width)).toBe(400);
  expect(parseFloat(visualizer.style.height)).toBe(300);
});

it("drags from the picture without turning the pin into a drag handle", () => {
  const unpin = vi.fn();
  render(panel(unpin));
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const picture = visualizer.querySelector("svg[viewBox='0 0 320 240']")!;
  mockPointerCapture(visualizer);
  const initialLeft = parseFloat(visualizer.style.left);

  pointerEvent(picture, "pointerdown");
  pointerEvent(visualizer, "pointermove", { clientX: 40 });
  pointerEvent(visualizer, "pointerup");
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 40);

  const pin = screen.getByRole("button", { name: "Unpin" });
  pointerEvent(pin, "pointerdown");
  pointerEvent(visualizer, "pointermove", { clientX: 80 });
  pointerEvent(pin, "pointerup");
  fireEvent.click(pin);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 40);
  expect(unpin).toHaveBeenCalledOnce();
});

it("switches to resizing from the center while Alt is held", () => {
  render(panel());
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const handle = screen.getByRole("button", {
    name: "Resize Space visualizer from bottom-right",
  });
  mockPointerCapture(handle);
  const initialLeft = parseFloat(visualizer.style.left);
  const initialTop = parseFloat(visualizer.style.top);

  pointerEvent(handle, "pointerdown");
  pointerEvent(handle, "pointermove", { clientX: 40 });
  expect(parseFloat(visualizer.style.width)).toBe(360);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft);

  pointerEvent(handle, "pointermove", { clientX: 40, altKey: true });
  expect(parseFloat(visualizer.style.width)).toBe(400);
  expect(parseFloat(visualizer.style.height)).toBe(300);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft - 40);
  expect(parseFloat(visualizer.style.top)).toBe(initialTop - 30);

  pointerEvent(handle, "pointermove", { clientX: 40 });
  pointerEvent(handle, "pointerup");
  expect(parseFloat(visualizer.style.width)).toBe(360);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft);

  fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
  expect(parseFloat(visualizer.style.width)).toBeCloseTo(370);
  expect(parseFloat(visualizer.style.left)).toBeCloseTo(initialLeft - 5);
});

it.each(["pointerup", "pointercancel", "lostpointercapture"])(
  "ends dragging on %s and ignores other pointers",
  (endEvent) => {
    canvas.viewport.zoom = 0.5;
    render(panel());
    const handle = screen.getByRole("button", {
      name: "Move Space visualizer",
    });
    const release = mockPointerCapture(handle);
    const visualizer = screen.getByRole("group", {
      name: "Space state visualizer",
    });
    const initialLeft = parseFloat(visualizer.style.left);

    pointerEvent(handle, "pointerdown", { button: 2 });
    pointerEvent(handle, "pointermove", { clientX: 30 });
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft);

    pointerEvent(handle, "pointerdown");
    pointerEvent(handle, endEvent, { pointerId: 2 });
    pointerEvent(handle, "pointermove", { clientX: 30 });
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 60);

    pointerEvent(handle, endEvent);
    pointerEvent(handle, "pointermove", { clientX: 50 });
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 60);
    expect(release).toHaveBeenCalledWith(1);
  },
);
