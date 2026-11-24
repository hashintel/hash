/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { OverlayScrollArea } from "./overlay-scroll-area";

afterEach(cleanup);

/**
 * A pointer event with a button and coordinates: jsdom has no PointerEvent,
 * so `fireEvent.pointerDown` would carry neither.
 */
const pointer = (
  target: EventTarget,
  type: string,
  init: MouseEventInit = {},
) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));

/** A wheel event the scrollbar may cancel; returned to read whether it did. */
const wheel = (target: EventTarget, init: WheelEventInit) => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

type Orientation = "vertical" | "horizontal";

/** Gives the viewport the lengths jsdom does not lay out, along one axis. */
const sizeViewport = (
  viewport: HTMLElement,
  { visible, whole }: { visible: number; whole: number },
  orientation: Orientation = "vertical",
) => {
  const vertical = orientation === "vertical";
  Object.defineProperty(viewport, vertical ? "clientHeight" : "clientWidth", {
    value: visible,
  });
  Object.defineProperty(viewport, vertical ? "scrollHeight" : "scrollWidth", {
    value: whole,
  });
};

/** A mounted area. `scrollbar` and `thumb` are those of `orientation`. */
const renderArea = (orientation: Orientation = "vertical") => {
  const view = render(
    <OverlayScrollArea>
      <p>Content</p>
    </OverlayScrollArea>,
  );
  const root = view.container.firstElementChild as HTMLElement;
  const viewport = root.querySelector<HTMLElement>('[data-part="viewport"]')!;
  const scrollbar = root.querySelector<HTMLElement>(
    `[data-part="scrollbar"][data-orientation="${orientation}"]`,
  )!;
  const thumb = scrollbar.firstElementChild as HTMLElement;
  return { view, root, viewport, scrollbar, thumb };
};

// The lengths every test below gives the viewport: 100 px of 400 px shown.
// The thumb is (100 - 2 × 2 px padding) × 100 / 400 = 24 px long and travels
// 100 - 24 - 4 = 72 px, so a pixel of thumb is 300 / 72 px of content.
const lengths = { visible: 100, whole: 400 };

it("sizes and places the thumb on the thumb, and writes nothing the content inherits", () => {
  const { root, viewport, scrollbar, thumb } = renderArea();
  expect(scrollbar.hasAttribute("data-overflow-y")).toBe(false);

  sizeViewport(viewport, lengths);
  viewport.scrollTop = 150;
  fireEvent.scroll(viewport);

  expect(scrollbar.hasAttribute("data-overflow-y")).toBe(true);
  // 150 of the 300 px it can scroll puts the thumb half way.
  expect(thumb.style.height).toBe("24px");
  expect(thumb.style.transform).toBe("translate3d(0,36px,0)");
  expect(root.getAttribute("style")).toBeNull();
  expect(viewport.getAttribute("style")).toBeNull();
});

it("places the horizontal thumb from the right where the content runs right to left", () => {
  const { viewport, scrollbar, thumb } = renderArea("horizontal");
  sizeViewport(viewport, lengths, "horizontal");
  // Right to left, scrollLeft runs from 0 down to minus the range.
  viewport.scrollLeft = -150;
  fireEvent.scroll(viewport);

  expect(scrollbar.hasAttribute("data-overflow-x")).toBe(true);
  expect(thumb.style.width).toBe("24px");
  expect(thumb.style.transform).toBe("translate3d(-36px,0,0)");
});

it("shows the scrollbars while the pointer is over the area", () => {
  const { root, scrollbar } = renderArea();

  fireEvent.pointerEnter(root);
  expect(scrollbar.hasAttribute("data-hover")).toBe(true);

  fireEvent.pointerLeave(root);
  expect(scrollbar.hasAttribute("data-hover")).toBe(false);
});

it("scrolls the viewport as the thumb is dragged", () => {
  const { viewport, scrollbar, thumb } = renderArea();
  sizeViewport(viewport, lengths);
  fireEvent.scroll(viewport);

  pointer(thumb, "pointerdown", { button: 0, clientY: 50 });
  expect(scrollbar.hasAttribute("data-dragging")).toBe(true);
  pointer(window, "pointermove", { clientY: 86 });
  expect(viewport.scrollTop).toBe(150);

  pointer(window, "pointerup");
  expect(scrollbar.hasAttribute("data-dragging")).toBe(false);
  pointer(window, "pointermove", { clientY: 50 });
  expect(viewport.scrollTop).toBe(150);
});

it("scrolls the other way as the horizontal thumb is dragged right to left", () => {
  const { viewport, thumb } = renderArea("horizontal");
  sizeViewport(viewport, lengths, "horizontal");
  viewport.style.direction = "rtl";
  fireEvent.scroll(viewport);

  pointer(thumb, "pointerdown", { button: 0, clientX: 80 });
  pointer(window, "pointermove", { clientX: 44 });

  expect(viewport.scrollLeft).toBeCloseTo(-150);
});

it("takes no press of another button for a drag", () => {
  const { viewport, scrollbar, thumb } = renderArea();
  sizeViewport(viewport, lengths);

  pointer(thumb, "pointerdown", { button: 2, clientY: 50 });
  pointer(window, "pointermove", { clientY: 86 });

  expect(scrollbar.hasAttribute("data-dragging")).toBe(false);
  expect(viewport.scrollTop).toBe(0);
});

it("brings the middle of the thumb under a press on the track, and follows the pointer from there", () => {
  const { viewport, scrollbar } = renderArea();
  sizeViewport(viewport, lengths);

  // jsdom lays nothing out, so the track starts at 0: a thumb centred on
  // 50 px lies 36 px into its 72 px of travel, half way.
  pointer(scrollbar, "pointerdown", { button: 0, clientY: 50 });
  expect(viewport.scrollTop).toBeCloseTo(150);
  expect(scrollbar.hasAttribute("data-dragging")).toBe(true);

  pointer(window, "pointermove", { clientY: 68 });
  expect(viewport.scrollTop).toBeCloseTo(225);
});

it("scrolls the viewport for a wheel over a scrollbar, and leaves the wheel alone at either end", () => {
  const { viewport, scrollbar } = renderArea();
  sizeViewport(viewport, lengths);

  expect(wheel(scrollbar, { deltaY: -40 }).defaultPrevented).toBe(false);
  expect(viewport.scrollTop).toBe(0);

  expect(wheel(scrollbar, { deltaY: 40 }).defaultPrevented).toBe(true);
  expect(viewport.scrollTop).toBe(40);

  viewport.scrollTop = 300;
  expect(wheel(scrollbar, { deltaY: 40 }).defaultPrevented).toBe(false);
  expect(viewport.scrollTop).toBe(300);
});

it("leaves a wheel with Ctrl, which zooms the page, alone", () => {
  const { viewport, scrollbar } = renderArea();
  sizeViewport(viewport, lengths);

  const event = wheel(scrollbar, { deltaY: 40, ctrlKey: true });

  expect(event.defaultPrevented).toBe(false);
  expect(viewport.scrollTop).toBe(0);
});

it("lets go of the area when it unmounts: a drag ends and no thumb follows a scroll", () => {
  const { view, root, viewport, scrollbar, thumb } = renderArea();
  sizeViewport(viewport, lengths);
  fireEvent.scroll(viewport);
  fireEvent.pointerLeave(root);
  pointer(thumb, "pointerdown", { button: 0, clientY: 50 });

  view.unmount();

  expect(scrollbar.hasAttribute("data-dragging")).toBe(false);
  pointer(window, "pointermove", { clientY: 86 });
  expect(viewport.scrollTop).toBe(0);

  viewport.scrollTop = 150;
  fireEvent.scroll(viewport);
  expect(thumb.style.transform).toBe("translate3d(0,0px,0)");

  fireEvent.pointerEnter(root);
  expect(scrollbar.hasAttribute("data-hover")).toBe(false);
});
