/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  createContext,
  use,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import {
  EditorContext,
  type EditorState,
} from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { useCanvasScene } from "./use-canvas-scene";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";

const net: ActiveNetDefinition = {
  places: ["input", "output"].map((id) => ({
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
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
};

const TestEditorUpdateContext = createContext<
  Dispatch<SetStateAction<Partial<EditorState>>>
>(() => {});

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
  initialState: Partial<EditorState> = {},
  highlightOnHover = true,
) => {
  const canvasRef = { current: canvas };
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const [editorState, setEditorState] = useState(initialState);
    const editor = use(EditorContext);
    const sdcpn = use(SDCPNContext);
    const activeNet = use(ActiveNetContext);
    const settings = use(UserSettingsContext);
    return (
      <ActiveNetContext value={{ ...activeNet, activeNet: net }}>
        <SDCPNContext value={{ ...sdcpn, petriNetDefinition: net }}>
          <EditorContext value={{ ...editor, ...editorState }}>
            <UserSettingsContext value={{ ...settings, highlightOnHover }}>
              <TestEditorUpdateContext value={setEditorState}>
                {children}
              </TestEditorUpdateContext>
            </UserSettingsContext>
          </EditorContext>
        </SDCPNContext>
      </ActiveNetContext>
    );
  };
  const { result } = renderHook(
    () => ({
      scene: useCanvasScene(canvasRef),
      update: use(TestEditorUpdateContext),
    }),
    {
      wrapper: Wrapper,
    },
  );
  return {
    result,
    update: (state: Partial<EditorState>) => {
      act(() =>
        result.current.update((previous) => ({ ...previous, ...state })),
      );
    },
  };
};

describe("canvas hover during dragging", () => {
  it("still waits for ordinary pointer movement to stop", () => {
    const { result, update } = renderScene();
    movePointer(100);
    update({ hoveredItem: { id: "input", type: "place" } });
    advanceTime(149);
    expect(result.current.scene.focusActive).toBe(false);

    advanceTime(1);
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: true, focus: "focused" });
  });

  it.each([
    { id: "output", type: "place" as const },
    { id: "transition", type: "transition" as const },
  ])("focuses a dragged $type before the pointer rests", (hoveredItem) => {
    const { result, update } = renderScene({
      hoveredItem: { id: "input", type: "place" },
    });
    movePointer(100);
    update({ hoveredItem });
    expect(
      result.current.scene.nodes.find((node) => node.id === hoveredItem.id),
    ).toMatchObject({ hovered: false });

    update({
      draggingStateByNodeId: {
        [hoveredItem.id]: { dragging: true, position: { x: 110, y: 0 } },
      },
    });
    expect(
      result.current.scene.nodes.find((node) => node.id === hoveredItem.id),
    ).toMatchObject({ hovered: true, focus: "focused", dragging: true });
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: false });
  });

  it("keeps the dragged node hovered until drop, then resumes the rest delay", () => {
    const { result, update } = renderScene({
      hoveredItem: { id: "input", type: "place" },
      draggingStateByNodeId: {
        input: { dragging: true, position: { x: 50, y: 0 } },
      },
    });
    movePointer(100);
    update({ hoveredItem: null });
    advanceTime(150);
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: true, focus: "focused" });

    update({ hoveredItem: { id: "output", type: "place" } });
    advanceTime(150);
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: true, focus: "focused" });

    movePointer(200);
    update({ draggingStateByNodeId: {} });
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: true, dragging: false });
    advanceTime(150);
    expect(
      result.current.scene.nodes.find((node) => node.id === "output"),
    ).toMatchObject({ hovered: true, focus: "focused" });
  });

  it("respects Highlight on hover while still reporting drag hover", () => {
    const { result, update } = renderScene({}, false);
    movePointer(100);
    update({
      hoveredItem: { id: "input", type: "place" },
      draggingStateByNodeId: {
        input: { dragging: true, position: { x: 50, y: 0 } },
      },
    });
    expect(result.current.scene.focusActive).toBe(false);
    expect(
      result.current.scene.nodes.find((node) => node.id === "input"),
    ).toMatchObject({ hovered: true, focus: "none", dragging: true });
  });
});
