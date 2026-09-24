/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  useFloatingPanel,
  type FloatingResizeDirection,
} from "./use-floating-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ResizeHarness = ({
  direction,
  wrapped = false,
}: {
  direction: FloatingResizeDirection;
  /** Renders the panel inside an unpositioned column, as a docked panel is. */
  wrapped?: boolean;
}) => {
  const [width, setWidth] = useState(600);
  const { panelRef, getResizeHandleProps, style } = useFloatingPanel({
    width,
    onWidthChange: setWidth,
  });
  const panel = (
    <aside
      ref={panelRef}
      data-height={style["--floating-panel-height"]}
      aria-label="AI assistant"
    >
      <button type="button" {...getResizeHandleProps(direction)}>
        Resize
      </button>
      <output>{width}</output>
    </aside>
  );
  return (
    <div data-testid="editor">
      {wrapped ? <div data-testid="column">{panel}</div> : panel}
    </div>
  );
};

const startResize = (
  direction: FloatingResizeDirection,
  panelBounds: DOMRect,
  editorBounds: DOMRect,
  { wrapped = false } = {},
) => {
  render(<ResizeHarness direction={direction} wrapped={wrapped} />);
  const panel = screen.getByRole("complementary");
  const editor = screen.getByTestId("editor");
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(panelBounds);
  vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(editorBounds);
  if (wrapped) {
    // jsdom lays nothing out, so the containing block is declared: the
    // editor, past the zero-width column the panel is a child of.
    Object.defineProperty(panel, "offsetParent", { value: editor });
    vi.spyOn(
      screen.getByTestId("column"),
      "getBoundingClientRect",
    ).mockReturnValue(
      new DOMRect(editorBounds.right, 0, 0, editorBounds.height),
    );
  }
  const handle = screen.getByRole("button", { name: "Resize" });
  Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() });
  const move = (clientX: number, clientY: number) => {
    const event = new MouseEvent("pointermove", {
      bubbles: true,
      clientX,
      clientY,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    fireEvent(handle, event);
  };
  const down = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(down, "pointerId", { value: 1 });
  fireEvent(handle, down);
  return { panel, move };
};

test.each(["top", "bottom", "top-left", "bottom-right"] as const)(
  "preserves the saved width during a vertical %s drag in a narrow editor",
  (direction) => {
    const { move } = startResize(
      direction,
      new DOMRect(12, 100, 296, 500),
      new DOMRect(0, 0, 320, 800),
    );
    move(0, 40);
    expect(screen.getByRole("status").textContent).toBe("600");
  },
);

test.each(["left", "right"] as const)(
  "preserves the saved height during a horizontal %s drag in a short editor",
  (direction) => {
    const { panel, move } = startResize(
      direction,
      new DOMRect(100, 12, 600, 276),
      new DOMRect(0, 0, 1000, 300),
    );
    const savedHeight = panel.getAttribute("data-height");
    move(40, 0);
    expect(screen.getByRole("status").textContent).toBe(
      direction === "left" ? "560" : "640",
    );
    expect(panel.getAttribute("data-height")).toBe(savedHeight);
  },
);

test("restores the saved size when a corner drag returns to its starting point", () => {
  const { panel, move } = startResize(
    "bottom-right",
    new DOMRect(12, 12, 396, 376),
    new DOMRect(0, 0, 420, 400),
  );
  const savedHeight = panel.getAttribute("data-height");
  move(-40, -40);
  expect(screen.getByRole("status").textContent).toBe("356");
  expect(panel.getAttribute("data-height")).not.toBe(savedHeight);
  move(0, 0);
  expect(screen.getByRole("status").textContent).toBe("600");
  expect(panel.getAttribute("data-height")).toBe(savedHeight);
});

test("measures a drag against the containing block, not an unpositioned parent", () => {
  const { move } = startResize(
    "left",
    new DOMRect(100, 12, 600, 276),
    new DOMRect(0, 0, 1000, 300),
    { wrapped: true },
  );
  move(40, 0);
  expect(screen.getByRole("status").textContent).toBe("560");
});
