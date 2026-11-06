/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { ReactNode } from "react";

vi.mock("@xyflow/react", () => ({
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Top: "top", Bottom: "bottom" },
  useInternalNode: () => ({
    internals: { positionAbsolute: { x: 300, y: 300 } },
  }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}));
vi.mock("./place-state-tooltip/visualizer-window", () => ({
  VisualizerWindow: ({
    children,
    onClose,
    onKeepOpen,
    editing,
  }: {
    children: (size: { width: number; height: number }) => ReactNode;
    onClose: () => void;
    onKeepOpen: () => void;
    editing: boolean;
  }) => (
    <div role="group" data-editing={editing}>
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" onClick={onKeepOpen}>
        Move
      </button>
      {children({ width: 360, height: 240 })}
    </div>
  ),
}));
vi.mock("../../../../shared/place-state-visualization", () => ({
  PlaceStateVisualization: ({ placeType }: { placeType: unknown }) => (
    <div>{placeType ? "Picture" : "Place has no type set"}</div>
  ),
}));

const Harness = ({
  focused = false,
  keptOpen = false,
  typed = false,
  hovered = false,
  code = "return <Visualizer.Svg />;",
}) => {
  const editor = use(EditorContext);
  const [openId, setOpenId] = useState<string | null>(null);
  const [keptOpenByClick, setKeptOpenByClick] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<typeof editor.hoveredItem>(
    hovered ? { type: "place", id: "place" } : null,
  );
  const activeNet = use(ActiveNetContext);
  return (
    <ActiveNetContext
      value={{
        ...activeNet,
        activeNet: {
          ...activeNet.activeNet,
          types: typed
            ? [
                {
                  id: "type",
                  name: "Type",
                  iconSlug: "circle",
                  displayColor: "#3366ff",
                  elements: [{ elementId: "x", name: "x", type: "real" }],
                },
              ]
            : [],
          places: [
            {
              id: "place",
              name: "Place",
              x: 300,
              y: 300,
              colorId: typed ? "type" : null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              visualizerCode: code,
            },
          ],
        },
      }}
    >
      <EditorContext
        value={{
          ...editor,
          openVisualizerPlaceId: openId,
          openPlaceVisualizer: setOpenId,
          keepPlaceVisualizerOpen: () => setKeptOpenByClick(true),
          closePlaceVisualizer: () => {
            setKeptOpenByClick(false);
            setOpenId(null);
            setHoveredItem(null);
          },
          hoveredItem,
          setHoveredItem,
          clearHoveredItem: () => setHoveredItem(null),
          focusedVisualizerPlaceId: focused ? "place" : null,
          keptOpenVisualizerPlaceIds: new Set(
            keptOpen || keptOpenByClick ? ["place"] : [],
          ),
        }}
      >
        <output aria-label="Kept open">
          {String(keptOpen || keptOpenByClick)}
        </output>
        <PlaceStateTooltip nodeId="place" />
      </EditorContext>
    </ActiveNetContext>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["", "return <Visualizer.Svg />;"])(
  "opens a temporary preview while editing a place without a type: %s",
  async (code) => {
    const { rerender } = render(<Harness focused code={code} />);
    await screen.findByText("Place has no type set");
    expect(screen.getByRole("group").dataset).toMatchObject({
      editing: "true",
    });
    rerender(<Harness code={code} />);
    expect(screen.queryByRole("group")).toBeNull();
  },
);

it("preserves the same preview when kept open through focus and blur", async () => {
  const { rerender } = render(<Harness focused />);
  await screen.findByText("Place has no type set");
  const preview = screen.getByRole("group");
  rerender(<Harness focused keptOpen />);
  expect(screen.getByRole("group")).toBe(preview);
  rerender(<Harness keptOpen />);
  expect(screen.getByRole("group")).toBe(preview);
  expect(preview.dataset).toMatchObject({ editing: "false" });
});

it("previews after 15 ms, keeps the eye clickable, keeps the window open and closes", async () => {
  vi.useFakeTimers();
  render(<Harness typed hovered />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.pointerEnter(eye);
  await act(() => vi.advanceTimersByTimeAsync(14));
  expect(screen.queryByRole("group")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  const preview = screen.getByRole("group");
  expect(screen.getByLabelText("Kept open").textContent).toBe("false");
  expect(screen.getByRole("button", { name: "Show state visualizer" })).toBe(
    eye,
  );
  fireEvent.click(eye);
  expect(screen.getByRole("group")).toBe(preview);
  expect(screen.getByLabelText("Kept open").textContent).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.getByLabelText("Kept open").textContent).toBe("false");
  await act(() => vi.advanceTimersByTimeAsync(20));
  expect(screen.queryByRole("group")).toBeNull();
});

it("cancels a brief hover and closes a temporary preview after leaving", async () => {
  vi.useFakeTimers();
  render(<Harness typed hovered />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.pointerEnter(eye);
  await act(() => vi.advanceTimersByTimeAsync(10));
  fireEvent.pointerLeave(eye);
  await act(() => vi.advanceTimersByTimeAsync(20));
  expect(screen.queryByRole("group")).toBeNull();
  cleanup();
  render(<Harness typed hovered />);
  fireEvent.pointerEnter(
    screen.getByRole("button", { name: "Show state visualizer" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(15));
  expect(screen.getByRole("group")).toBeDefined();
  fireEvent.pointerLeave(
    screen.getByRole("button", { name: "Show state visualizer" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(screen.queryByRole("group")).toBeNull();
});

it("keeps a temporary preview open after interacting with it", async () => {
  vi.useFakeTimers();
  render(<Harness typed hovered />);
  fireEvent.pointerEnter(
    screen.getByRole("button", { name: "Show state visualizer" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(15));
  fireEvent.click(screen.getByRole("button", { name: "Move" }));
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByRole("group")).toBeDefined();
  expect(screen.getByLabelText("Kept open").textContent).toBe("true");
  expect(
    screen.queryByRole("button", { name: "Show state visualizer" }),
  ).toBeNull();
});

it("previews from keyboard focus and dismisses with Escape", async () => {
  vi.useFakeTimers();
  render(<Harness typed hovered />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.focus(eye);
  await act(() => vi.advanceTimersByTimeAsync(15));
  expect(screen.getByRole("group")).toBeDefined();
  expect(screen.getByLabelText("Kept open").textContent).toBe("false");
  fireEvent.keyDown(eye, { key: "Escape" });
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.queryByRole("group")).toBeNull();
});
