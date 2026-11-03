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
    editing,
  }: {
    children: ReactNode;
    onClose: () => void;
    editing: boolean;
  }) => (
    <div role="group" data-editing={editing}>
      <button type="button" onClick={onClose}>
        Close
      </button>
      {children}
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
  pinned = false,
  typed = false,
  hovered = false,
  code = "export default Visualization(() => <svg />);",
}) => {
  const editor = use(EditorContext);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinnedByClick, setPinnedByClick] = useState(false);
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
          toggleVisualizerPin: () => setPinnedByClick((previous) => !previous),
          hoveredItem,
          setHoveredItem,
          clearHoveredItem: () => setHoveredItem(null),
          focusedVisualizerPlaceId: focused ? "place" : null,
          pinnedVisualizerPlaceIds: new Set(
            pinned || pinnedByClick ? ["place"] : [],
          ),
        }}
      >
        <output aria-label="Pinned">{String(pinned || pinnedByClick)}</output>
        <PlaceStateTooltip nodeId="place" />
      </EditorContext>
    </ActiveNetContext>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["", "export default Visualization(() => <svg />);"])(
  "opens an unpinned preview while editing a place without a type: %s",
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

it("preserves the same preview through pinning, focus and blur", async () => {
  const { rerender } = render(<Harness focused />);
  await screen.findByText("Place has no type set");
  const preview = screen.getByRole("group");
  rerender(<Harness focused pinned />);
  expect(screen.getByRole("group")).toBe(preview);
  rerender(<Harness pinned />);
  expect(screen.getByRole("group")).toBe(preview);
  expect(preview.dataset).toMatchObject({ editing: "false" });
});

it("previews after 15 ms, keeps the eye clickable, pins in place and closes", async () => {
  vi.useFakeTimers();
  render(<Harness typed hovered />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.pointerEnter(eye);
  await act(() => vi.advanceTimersByTimeAsync(14));
  expect(screen.queryByRole("group")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  const preview = screen.getByRole("group");
  expect(screen.getByLabelText("Pinned").textContent).toBe("false");
  expect(screen.getByRole("button", { name: "Show state visualizer" })).toBe(
    eye,
  );
  fireEvent.click(eye);
  expect(screen.getByRole("group")).toBe(preview);
  expect(screen.getByLabelText("Pinned").textContent).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("group")).toBeNull();
  expect(screen.getByLabelText("Pinned").textContent).toBe("false");
  await act(() => vi.advanceTimersByTimeAsync(20));
  expect(screen.queryByRole("group")).toBeNull();
});

it("cancels a brief hover and closes an unpinned preview after leaving", async () => {
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
