import { fireEvent } from "@testing-library/react";

/** The frame header's element, for tests that read its height and state. */
export const frameHeader = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-frame-header]")!;

/** The frame body's scroll container. */
export const frameBody = (): HTMLElement =>
  document.querySelector<HTMLElement>("[data-frame-body]")!;

/**
 * Scrolls the frame body to `top` the way a wheel would: jsdom lays nothing
 * out, so the offset is set on the element and its scroll event fired.
 */
export const scrollFrameBody = (top: number): void => {
  Object.defineProperty(frameBody(), "scrollTop", {
    configurable: true,
    value: top,
  });
  fireEvent.scroll(frameBody());
};
