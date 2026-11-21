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

/** Gives the viewport the lengths jsdom does not lay out. */
const sizeViewport = (
  viewport: HTMLElement,
  { visible, whole }: { visible: number; whole: number },
) => {
  Object.defineProperty(viewport, "clientHeight", { value: visible });
  Object.defineProperty(viewport, "scrollHeight", { value: whole });
};

const renderArea = () => {
  const view = render(
    <OverlayScrollArea>
      <p>Content</p>
    </OverlayScrollArea>,
  );
  const root = view.container.firstElementChild as HTMLElement;
  const viewport = root.querySelector<HTMLElement>('[data-part="viewport"]')!;
  const scrollbar = root.querySelector<HTMLElement>(
    '[data-part="scrollbar"][data-orientation="vertical"]',
  )!;
  const thumb = scrollbar.firstElementChild as HTMLElement;
  return { root, viewport, scrollbar, thumb };
};

it("sizes and places the thumb on the thumb, and writes nothing the content inherits", () => {
  const { root, viewport, scrollbar, thumb } = renderArea();
  expect(scrollbar.hasAttribute("data-overflow-y")).toBe(false);

  sizeViewport(viewport, { visible: 100, whole: 400 });
  viewport.scrollTop = 150;
  fireEvent.scroll(viewport);

  expect(scrollbar.hasAttribute("data-overflow-y")).toBe(true);
  // (100 - 2 × 2 px padding) × 100 / 400 = 24 px; it travels 100 - 24 - 4 =
  // 72 px, and 150 of the 300 px it can scroll puts it half way.
  expect(thumb.style.height).toBe("24px");
  expect(thumb.style.transform).toBe("translate3d(0,36px,0)");
  expect(root.getAttribute("style")).toBeNull();
  expect(viewport.getAttribute("style")).toBeNull();
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
  sizeViewport(viewport, { visible: 100, whole: 400 });
  fireEvent.scroll(viewport);

  pointer(thumb, "pointerdown", { button: 0, clientY: 50 });
  expect(scrollbar.hasAttribute("data-dragging")).toBe(true);
  // A pixel of thumb is 300 / 72 px of content.
  pointer(window, "pointermove", { clientY: 86 });
  expect(viewport.scrollTop).toBe(150);

  pointer(window, "pointerup");
  expect(scrollbar.hasAttribute("data-dragging")).toBe(false);
  pointer(window, "pointermove", { clientY: 50 });
  expect(viewport.scrollTop).toBe(150);
});
