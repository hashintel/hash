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

import { ActiveNetContext } from "../../../../../../react/document/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import {
  CanvasPointerContext,
  createCanvasPointer,
} from "../../../canvas-pointer";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { PointerEventHandler, ReactNode } from "react";

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
    onPointerEnter,
    onPointerLeave,
    editing,
  }: {
    children: (size: { width: number; height: number }) => ReactNode;
    onClose: () => void;
    onKeepOpen: () => void;
    onPointerEnter: PointerEventHandler;
    onPointerLeave: PointerEventHandler;
    editing: boolean;
  }) => (
    <div
      role="group"
      data-editing={editing}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
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
vi.mock("../../../../../visualizer/place-state-visualization", () => ({
  PlaceStateVisualization: ({ placeType }: { placeType: unknown }) => (
    <div>{placeType ? "Picture" : "Picture of a count"}</div>
  ),
}));

const Harness = ({
  focused = false,
  keptOpen = false,
  typed = false,
  hovered = false,
  code = "return <Visualizer.Svg />;",
  pointer: given = createCanvasPointer(),
}) => {
  const editor = use(EditorContext);
  const [openId, setOpenId] = useState<string | null>(null);
  const [keptOpenByClick, setKeptOpenByClick] = useState(false);
  const [pointer] = useState(() => {
    given.hoveredId.set(hovered ? "place" : null);
    return given;
  });
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
          },
          focusedVisualizerPlaceId: focused ? "place" : null,
          keptOpenVisualizerPlaceIds: new Set(
            keptOpen || keptOpenByClick ? ["place"] : [],
          ),
        }}
      >
        <output aria-label="Kept open">
          {String(keptOpen || keptOpenByClick)}
        </output>
        <CanvasPointerContext value={pointer}>
          <PlaceStateTooltip nodeId="place" />
        </CanvasPointerContext>
      </EditorContext>
    </ActiveNetContext>
  );
};

/**
 * The pointer comes onto an element or leaves it, with `buttons` down. React
 * reports an enter and a leave from the over and the out of the browser.
 */
const movePointer = (
  type: "pointerover" | "pointerout",
  element: Element,
  buttons = 0,
) => fireEvent(element, new MouseEvent(type, { bubbles: true, buttons }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["", "return <Visualizer.Svg />;"])(
  "opens a temporary preview while editing a place without a type: %s",
  async (code) => {
    const { rerender } = render(<Harness focused code={code} />);
    await screen.findByText("Picture of a count");
    expect(screen.getByRole("group").dataset).toMatchObject({
      editing: "true",
    });
    rerender(<Harness code={code} />);
    expect(screen.queryByRole("group")).toBeNull();
  },
);

it("preserves the same preview when kept open through focus and blur", async () => {
  const { rerender } = render(<Harness focused />);
  await screen.findByText("Picture of a count");
  const preview = screen.getByRole("group");
  rerender(<Harness focused keptOpen />);
  expect(screen.getByRole("group")).toBe(preview);
  rerender(<Harness keptOpen />);
  expect(screen.getByRole("group")).toBe(preview);
  expect(preview.dataset).toMatchObject({ editing: "false" });
});

it("shows the eye on a place without a type, and previews its count", async () => {
  vi.useFakeTimers();
  render(<Harness hovered />);
  fireEvent.pointerEnter(
    screen.getByRole("button", { name: "Show state visualizer" }),
  );
  await act(() => vi.advanceTimersByTimeAsync(15));
  expect(screen.getByRole("group").textContent).toContain("Picture of a count");
});

it("shows no eye on a place whose visualizer is empty", () => {
  render(<Harness hovered code="" />);
  expect(
    screen.queryByRole("button", { name: "Show state visualizer" }),
  ).toBeNull();
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

it("starts the grace of a temporary preview again when the pointer crosses another node", async () => {
  vi.useFakeTimers();
  const pointer = createCanvasPointer();
  render(<Harness typed hovered pointer={pointer} />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.pointerEnter(eye);
  await act(() => vi.advanceTimersByTimeAsync(15));
  fireEvent.pointerLeave(eye);
  await act(() => vi.advanceTimersByTimeAsync(150));
  act(() => pointer.hoveredId.set("transition"));
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(screen.getByRole("group")).toBeDefined();
  await act(() => vi.advanceTimersByTimeAsync(100));
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

it("hovers the place of a window kept open when the pointer comes onto the window", () => {
  const pointer = createCanvasPointer();
  render(<Harness keptOpen pointer={pointer} />);
  const visualizer = screen.getByRole("group");

  movePointer("pointerover", visualizer);
  expect(pointer.hoveredId.get()).toBe("place");

  movePointer("pointerout", visualizer);
  expect(pointer.hoveredId.get()).toBeNull();
});

it("keeps the place of a window kept open for the release when a pan carries the window under the pointer", () => {
  const pointer = createCanvasPointer();
  render(<Harness keptOpen pointer={pointer} />);
  const visualizer = screen.getByRole("group");

  movePointer("pointerover", visualizer, 1);
  expect(pointer.hoveredId.get()).toBeNull();
  expect(pointer.hoverOnReleaseId.get()).toBe("place");

  // The pan carries the window on, and the release finds nothing to hover.
  movePointer("pointerout", visualizer, 1);
  expect(pointer.hoverOnReleaseId.get()).toBeNull();
});

it("hovers the place of a preview whatever the buttons, so the preview stays open", async () => {
  vi.useFakeTimers();
  const pointer = createCanvasPointer();
  render(<Harness typed hovered pointer={pointer} />);
  const eye = screen.getByRole("button", { name: "Show state visualizer" });
  fireEvent.pointerEnter(eye);
  await act(() => vi.advanceTimersByTimeAsync(15));
  fireEvent.pointerLeave(eye);

  movePointer("pointerover", screen.getByRole("group"), 1);
  expect(pointer.hoveredId.get()).toBe("place");
  expect(pointer.hoverOnReleaseId.get()).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(250));
  expect(screen.getByRole("group")).toBeDefined();
});
