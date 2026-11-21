/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { useStore } from "../../../react/use-store";
import { createCanvasPointer } from "./canvas-pointer";
import { useCanvasScene } from "./use-canvas-scene";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { CanvasDragPreview } from "./canvas-scene";

const net: ActiveNetDefinition = {
  places: ["input", "output", "pictured"].map((id) => ({
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
    ...(id === "pictured" ? { visualizerCode: "return null;" } : {}),
  })),
  transitions: [
    {
      id: "transition",
      name: "Transition",
      inputArcs: [{ placeId: "input", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "output", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
  fusions: [],
};

let canvas: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  canvas = document.createElement("div");
  document.body.append(canvas);
});

afterEach(() => {
  cleanup();
  canvas.remove();
  vi.useRealTimers();
});

const movePointer = (x: number) => {
  act(() => {
    canvas.dispatchEvent(new MouseEvent("pointermove", { clientX: x }));
  });
};

const advanceTime = (milliseconds: number) => {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
};

const renderScene = (
  initial: { hoveredId?: string; dragPreview?: CanvasDragPreview } = {},
  highlightOnHover = true,
) => {
  const canvasRef = { current: canvas };
  const pointer = createCanvasPointer();
  pointer.hoveredId.set(initial.hoveredId ?? null);
  pointer.dragPreview.set(initial.dragPreview ?? new Map());
  const shownNet = createReadableStore(net);
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const sdcpn = use(SDCPNContext);
    const activeNet = use(ActiveNetContext);
    const settings = use(UserSettingsContext);
    const current = useStore(shownNet);
    return (
      <ActiveNetContext value={{ ...activeNet, activeNet: current }}>
        <SDCPNContext value={{ ...sdcpn, petriNetDefinition: current }}>
          <UserSettingsContext value={{ ...settings, highlightOnHover }}>
            {children}
          </UserSettingsContext>
        </SDCPNContext>
      </ActiveNetContext>
    );
  };
  const { result } = renderHook(() => useCanvasScene(canvasRef, pointer), {
    wrapper: Wrapper,
  });
  return {
    result,
    hover: (id: string | null) => act(() => pointer.hoveredId.set(id)),
    drag: (preview: CanvasDragPreview) =>
      act(() => pointer.dragPreview.set(preview)),
    showNet: (next: ActiveNetDefinition) => act(() => shownNet.set(next)),
  };
};

describe("canvas hover during dragging", () => {
  it("still waits for ordinary pointer movement to stop", () => {
    const { result, hover } = renderScene();
    movePointer(100);
    hover("input");
    advanceTime(149);
    expect(result.current.focusActive).toBe(false);

    advanceTime(1);
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "focused" });
  });

  it("offers a place's visualizer before the pointer rests on it", () => {
    const { result, hover } = renderScene();
    movePointer(100);
    hover("pictured");
    expect(
      result.current.nodes.find((node) => node.id === "pictured"),
    ).toMatchObject({ focus: "none", visualizerActive: true });
  });

  it.each([
    { id: "output", type: "place" },
    { id: "transition", type: "transition" },
  ])("focuses a dragged $type before the pointer rests", ({ id }) => {
    const { result, hover, drag } = renderScene({ hoveredId: "input" });
    movePointer(100);
    hover(id);
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "focused" });

    drag(new Map([[id, { x: 110, y: 0 }]]));
    expect(result.current.nodes.find((node) => node.id === id)).toMatchObject({
      focus: "focused",
      dragging: true,
    });
    expect(
      result.current.nodes.find((node) => node.id === "input")?.focus,
    ).not.toBe("focused");
  });

  it("keeps the dragged node hovered until drop, then resumes the rest delay", () => {
    const { result, hover, drag } = renderScene({
      hoveredId: "input",
      dragPreview: new Map([["input", { x: 50, y: 0 }]]),
    });
    movePointer(100);
    hover(null);
    advanceTime(150);
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "focused" });

    hover("output");
    advanceTime(150);
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "focused" });

    movePointer(200);
    drag(new Map());
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "focused", dragging: false });
    advanceTime(150);
    expect(
      result.current.nodes.find((node) => node.id === "output"),
    ).toMatchObject({ focus: "focused" });
  });

  it("focuses nothing for a drag while Highlight on hover is off", () => {
    const { result, hover, drag } = renderScene({}, false);
    movePointer(100);
    hover("input");
    drag(new Map([["input", { x: 50, y: 0 }]]));
    expect(result.current.focusActive).toBe(false);
    expect(
      result.current.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ focus: "none", dragging: true });
  });
});

describe("canvas hover on an item that leaves the net", () => {
  it("is forgotten, so an undo brings the item back unlit", () => {
    const { result, showNet } = renderScene({ hoveredId: "transition" });
    expect(result.current.focusActive).toBe(true);

    // Deleted under the pointer, then restored, with no pointer event between.
    showNet({ ...net, transitions: [] });
    showNet(net);

    expect(result.current.focusActive).toBe(false);
    expect(
      result.current.nodes.find((node) => node.id === "transition"),
    ).toMatchObject({ focus: "none" });
  });
});
