/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Suspense, use, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { VisualizerWindow } from "./visualizer-window";

const canvas = vi.hoisted(() => ({
  node: {
    internals: { positionAbsolute: { x: 500, y: 400 } },
    measured: { width: 100, height: 80 },
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  width: 1200,
  height: 800,
  insets: { left: 200, right: 0, bottom: 0 },
  domNode: null as HTMLElement | null,
}));

vi.mock("@xyflow/react", () => ({
  useInternalNode: () => canvas.node,
  useViewport: () => canvas.viewport,
  useStore: (selector: (state: typeof canvas) => unknown) => selector(canvas),
}));
vi.mock("../../../../../../hooks/use-canvas-insets", () => ({
  useCanvasInsets: () => canvas.insets,
}));
vi.mock("@hashintel/ds-components", () => ({
  Button: ({
    onClick,
    "aria-label": label,
    "aria-pressed": pressed,
  }: ComponentProps<"button">) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
    >
      {label}
    </button>
  ),
}));

const panel = (onClose = () => {}, onKeepOpen = () => {}) => (
  <VisualizerWindow
    nodeId="place"
    name="Space"
    editing={false}
    dimmed={false}
    animated
    onClose={onClose}
    onKeepOpen={onKeepOpen}
  >
    <svg viewBox="0 0 320 240" />
  </VisualizerWindow>
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
  canvas.width = 1200;
  canvas.height = 800;
  canvas.insets = { left: 200, right: 0, bottom: 0 };
  canvas.domNode = document.createElement("div");
  const renderer = document.createElement("div");
  renderer.className = "react-flow__renderer";
  canvas.domNode.appendChild(renderer);
  document.body.appendChild(canvas.domNode);
});
afterEach(() => {
  cleanup();
  canvas.domNode?.remove();
});

it.each([
  {
    name: "place movement",
    node: { x: 560, y: 440 },
    viewport: { x: 0, y: 0, zoom: 1 },
    delta: { x: 60, y: 40 },
  },
  {
    name: "Canvas panning",
    node: { x: 500, y: 400 },
    viewport: { x: 40, y: 30, zoom: 1 },
    delta: { x: 40, y: 30 },
  },
  {
    name: "Canvas zoom",
    node: { x: 500, y: 400 },
    viewport: { x: 300, y: 250, zoom: 0.5 },
    delta: { x: 25, y: 30 },
  },
])(
  "follows $name without changing its screen size",
  ({ node, viewport, delta }) => {
    const { rerender } = render(panel());
    const visualizer = screen.getByRole("group");
    const initialLeft = parseFloat(visualizer.style.left);
    const initialTop = parseFloat(visualizer.style.top);
    canvas.node.internals.positionAbsolute = node;
    canvas.viewport = viewport;
    rerender(panel());
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + delta.x);
    expect(parseFloat(visualizer.style.top)).toBe(initialTop + delta.y);
    expect(visualizer.style.width).toBe("360px");
    expect(visualizer.style.height).toBe("240px");
    expect(visualizer.dataset.fixed).toBe("false");
  },
);

it("switches between following and fixed positions without jumping", () => {
  const keepOpen = vi.fn();
  const { rerender } = render(panel(undefined, keepOpen));
  const visualizer = screen.getByRole("group");
  const pin = screen.getByRole("button", { name: "Fix position on screen" });
  const initialStyle = visualizer.getAttribute("style");
  fireEvent.click(pin);
  expect(keepOpen).toHaveBeenCalledOnce();
  expect(pin.getAttribute("aria-pressed")).toBe("true");
  expect(visualizer.getAttribute("style")).toBe(initialStyle);
  canvas.node.internals.positionAbsolute = { x: 600, y: 500 };
  rerender(panel(undefined, keepOpen));
  expect(visualizer.getAttribute("style")).toBe(initialStyle);
  fireEvent.click(pin);
  expect(pin.getAttribute("aria-pressed")).toBe("false");
  expect(visualizer.getAttribute("style")).toBe(initialStyle);
  const previousLeft = parseFloat(visualizer.style.left);
  canvas.node.internals.positionAbsolute.x += 30;
  rerender(panel(undefined, keepOpen));
  expect(parseFloat(visualizer.style.left)).toBe(previousLeft + 30);
});

it("remembers the dragged offset when following and restores it after the place returns from offscreen", () => {
  const keepOpen = vi.fn();
  const { rerender } = render(panel(undefined, keepOpen));
  const visualizer = screen.getByRole("group");
  mockPointerCapture(visualizer);
  pointerEvent(visualizer, "pointerdown");
  pointerEvent(visualizer, "pointermove", { clientX: 40, clientY: 20 });
  pointerEvent(visualizer, "pointerup");
  expect(keepOpen).toHaveBeenCalled();
  const initialLeft = parseFloat(visualizer.style.left);
  const initialTop = parseFloat(visualizer.style.top);
  canvas.node.internals.positionAbsolute.x += 50;
  rerender(panel(undefined, keepOpen));
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 50);
  canvas.node.internals.positionAbsolute = { x: -2000, y: -2000 };
  rerender(panel(undefined, keepOpen));
  expect(visualizer.style.left).toBe("200px");
  expect(visualizer.style.top).toBe("72px");
  canvas.node.internals.positionAbsolute = { x: 500, y: 400 };
  rerender(panel(undefined, keepOpen));
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft);
  expect(parseFloat(visualizer.style.top)).toBe(initialTop);
});

it("keeps keyboard manipulation open and closes with Escape, returning focus to its place", () => {
  const close = vi.fn();
  const keepOpen = vi.fn();
  const source = document.createElement("div");
  source.className = "react-flow__node";
  source.dataset.id = "place";
  source.tabIndex = 0;
  canvas.domNode!.querySelector(".react-flow__renderer")!.appendChild(source);
  render(panel(close, keepOpen));
  const handle = screen.getByRole("button", { name: "Move Space visualizer" });
  act(() => handle.focus());
  expect(keepOpen).toHaveBeenCalledOnce();
  fireEvent.keyDown(handle, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(source);
});

it("keeps its screen position when explicitly fixed, while updating the connector", () => {
  const { rerender } = render(panel());
  fireEvent.click(
    screen.getByRole("button", { name: "Fix position on screen" }),
  );
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const initialBounds = [
    visualizer.style.left,
    visualizer.style.top,
    visualizer.style.width,
    visualizer.style.height,
  ];
  expect(visualizer.parentElement?.className).toBe("react-flow__renderer");
  const initialConnector = canvas.domNode?.querySelector("line")?.outerHTML;
  expect(initialConnector).toBeDefined();

  canvas.node.internals.positionAbsolute = { x: 750, y: 600 };
  canvas.viewport = { x: -100, y: 50, zoom: 0.5 };
  rerender(panel());

  expect([
    visualizer.style.left,
    visualizer.style.top,
    visualizer.style.width,
    visualizer.style.height,
  ]).toEqual(initialBounds);
  expect(visualizer.style.transform).toBe("");
  expect(canvas.domNode?.querySelector("line")?.outerHTML).not.toBe(
    initialConnector,
  );
});

it("keeps the window visible when the container shrinks or panels open, restoring its preferred layout when space returns", () => {
  const { rerender } = render(panel());
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const initialStyle = visualizer.getAttribute("style");
  canvas.width = 600;
  canvas.height = 500;
  canvas.insets = { left: 200, right: 140, bottom: 200 };
  rerender(panel());
  const left = parseFloat(visualizer.style.left);
  const top = parseFloat(visualizer.style.top);
  const width = parseFloat(visualizer.style.width);
  const height = parseFloat(visualizer.style.height);
  expect(left).toBeGreaterThanOrEqual(200);
  expect(top).toBeGreaterThanOrEqual(72);
  expect(left + width).toBeLessThanOrEqual(412);
  expect(top + height).toBeLessThanOrEqual(236);
  expect(width).toBe(212);
  expect(height).toBe(164);

  canvas.width = 1200;
  canvas.height = 800;
  canvas.insets = { left: 200, right: 0, bottom: 0 };
  rerender(panel());
  expect(visualizer.getAttribute("style")).toBe(initialStyle);
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
    canvas.node.internals.positionAbsolute = { x: 500 / zoom, y: 400 / zoom };
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

    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 20);
    expect(parseFloat(visualizer.style.width)).toBe(initialWidth + 5);
    expect(parseFloat(visualizer.style.height)).toBe(240);
    expect(initialWidth).toBe(360);
    expect(visualizer.style.transform).toBe("");
    expect(canvas.node.internals.positionAbsolute).toEqual({
      x: 500 / zoom,
      y: 400 / zoom,
    });
  },
);

it("resizes freely with the shared corner resizer at reduced zoom", () => {
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
  expect(parseFloat(visualizer.style.width)).toBe(440);
  expect(parseFloat(visualizer.style.height)).toBe(250);
});

it("drags from the picture without turning the close button into a drag handle", () => {
  const close = vi.fn();
  render(panel(close));
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  const picture = visualizer.querySelector("svg[viewBox='0 0 320 240']")!;
  mockPointerCapture(visualizer);
  const initialLeft = parseFloat(visualizer.style.left);

  pointerEvent(picture, "pointerdown");
  expect(visualizer.dataset.dragging).toBe("true");
  pointerEvent(visualizer, "pointermove", { clientX: 40 });
  pointerEvent(visualizer, "pointerup");
  expect(visualizer.dataset.dragging).toBe("false");
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 40);

  fireEvent.keyDown(visualizer, { key: "ArrowRight" });
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 45);

  const closeButton = screen.getByRole("button", {
    name: "Close state visualizer",
  });
  pointerEvent(closeButton, "pointerdown");
  pointerEvent(visualizer, "pointermove", { clientX: 80 });
  pointerEvent(closeButton, "pointerup");
  fireEvent.click(closeButton);
  fireEvent.keyDown(closeButton, { key: "ArrowRight" });
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 45);
  expect(close).toHaveBeenCalledOnce();
});

it("stops dragging before the Canvas controls at the right and bottom edges", () => {
  render(panel());
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  mockPointerCapture(visualizer);
  pointerEvent(visualizer, "pointerdown");
  pointerEvent(visualizer, "pointermove", { clientX: 2000, clientY: 2000 });
  pointerEvent(visualizer, "pointerup");
  expect(
    parseFloat(visualizer.style.left) + parseFloat(visualizer.style.width),
  ).toBe(1152);
  expect(
    parseFloat(visualizer.style.top) + parseFloat(visualizer.style.height),
  ).toBe(736);
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
  expect(parseFloat(visualizer.style.width)).toBe(400);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft);

  pointerEvent(handle, "pointermove", { clientX: 40, altKey: true });
  expect(parseFloat(visualizer.style.width)).toBe(440);
  expect(parseFloat(visualizer.style.height)).toBe(240);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft - 40);
  expect(parseFloat(visualizer.style.top)).toBe(initialTop);

  pointerEvent(handle, "pointermove", { clientX: 40 });
  pointerEvent(handle, "pointerup");
  expect(parseFloat(visualizer.style.width)).toBe(400);
  expect(parseFloat(visualizer.style.left)).toBe(initialLeft);

  fireEvent.keyDown(handle, { key: "ArrowRight", altKey: true });
  expect(parseFloat(visualizer.style.width)).toBeCloseTo(410);
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
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 30);

    pointerEvent(handle, endEvent);
    pointerEvent(handle, "pointermove", { clientX: 50 });
    expect(parseFloat(visualizer.style.left)).toBe(initialLeft + 30);
    expect(release).toHaveBeenCalledWith(1);
  },
);

it("keeps its dragged layout when leaving the editor and while content loads", async () => {
  const pending = new Promise<never>(() => {});
  const PendingPicture = () => use(pending);
  const content = (keptOpen: boolean, loading: boolean) => (
    <VisualizerWindow
      nodeId="place"
      name="Space"
      editing={!keptOpen}
      dimmed={false}
      animated
      onClose={() => {}}
      onKeepOpen={() => {}}
    >
      <Suspense fallback={<div role="status">Loading visualizer</div>}>
        {loading ? <PendingPicture /> : <svg />}
      </Suspense>
    </VisualizerWindow>
  );
  const { rerender } = render(content(false, false));
  const visualizer = screen.getByRole("group", {
    name: "Space state visualizer",
  });
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Move Space visualizer" }),
    { key: "ArrowRight" },
  );
  const bounds = visualizer.getAttribute("style");
  expect(visualizer.dataset.editing).toBe("true");
  await act(async () => rerender(content(true, true)));
  expect(screen.getByRole("status").textContent).toBe("Loading visualizer");
  expect(screen.getByRole("group")).toBe(visualizer);
  expect(visualizer.getAttribute("style")).toBe(bounds);
  expect(visualizer.dataset.editing).toBe("false");
  await act(async () => rerender(content(true, false)));
  expect(screen.queryByRole("status")).toBeNull();
  expect(visualizer.getAttribute("style")).toBe(bounds);
});
