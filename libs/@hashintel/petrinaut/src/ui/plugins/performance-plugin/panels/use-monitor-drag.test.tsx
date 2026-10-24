/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useMonitorDrag } from "./use-monitor-drag";

const toggle = vi.fn();
const View = () => {
  const { panelRef, position, handleProps } = useMonitorDrag(toggle);
  return (
    <div data-editor>
      <div style={{ display: "contents" }}>
        <section ref={panelRef} style={position} aria-label="Monitor">
          <button type="button" {...handleProps}>
            Move or expand
          </button>
        </section>
      </div>
    </div>
  );
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(
    function getOffsetParent(this: HTMLElement) {
      return this.closest("[data-editor]");
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function getClientWidth(this: HTMLElement) {
      return this.hasAttribute("data-editor") ? 1000 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function getClientHeight(this: HTMLElement) {
      return this.hasAttribute("data-editor") ? 800 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(222);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(104);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBounds(this: HTMLElement) {
      return this.hasAttribute("data-editor")
        ? new DOMRect(0, 0, 1000, 800)
        : new DOMRect(
            Number.parseFloat(this.style.left),
            800 - Number.parseFloat(this.style.bottom) - 104,
            222,
            104,
          );
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toggle.mockClear();
});

const getHandle = () => {
  render(<View />);
  const handle = screen.getByRole("button");
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = () => true;
  handle.releasePointerCapture = vi.fn();
  return handle;
};

it("uses the positioned editor bounds through a display-contents wrapper and suppresses a drag click", () => {
  const handle = getHandle();
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 50,
    clientY: 720,
  });
  fireEvent.pointerMove(handle, {
    pointerId: 1,
    clientX: 4000,
    clientY: -1000,
  });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.click(handle, { detail: 1 });
  const panel = screen.getByRole("region");
  expect(panel.style.left).toBe("762px");
  expect(panel.style.bottom).toBe("632px");
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(panel.style.left).toBe("752px");
});

it("treats a small pointer movement as a click and releases cancelled drags", () => {
  const handle = getHandle();
  fireEvent.pointerDown(handle, {
    pointerId: 1,
    button: 0,
    clientX: 50,
    clientY: 720,
  });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 52, clientY: 720 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.click(handle, { detail: 1 });
  expect(toggle).toHaveBeenCalledOnce();
  fireEvent.pointerDown(handle, {
    pointerId: 2,
    button: 0,
    clientX: 50,
    clientY: 720,
  });
  fireEvent.pointerCancel(handle, { pointerId: 2 });
  fireEvent.pointerDown(handle, {
    pointerId: 3,
    button: 0,
    clientX: 50,
    clientY: 720,
  });
  fireEvent.pointerMove(handle, { pointerId: 3, clientX: 100, clientY: 700 });
  expect(screen.getByRole("region").style.left).toBe("66px");
});
