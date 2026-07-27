// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlideOver, SlideOverClose } from "./slide-over";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SlideOver", () => {
  it("moves the panel and backdrop into their visible state", async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });

    render(
      <SlideOver label="Step details" onClose={() => {}}>
        Step content
      </SlideOver>,
    );

    const dialog = screen.getByRole("dialog", { name: "Step details" });
    const positioner = dialog.parentElement as HTMLElement;
    const backdrop = document.querySelector<HTMLElement>(
      '[data-scope="dialog"][data-part="backdrop"]',
    );

    expect(backdrop).not.toBeNull();
    expect(positioner.style.inset).toBe("0");
    expect(positioner.style.right).toBe("");
    expect(dialog.style.right).toBe("-960px");
    expect(backdrop?.style.opacity).toBe("0");

    act(() => {
      const queuedFrames = animationFrames.splice(0);
      for (const animationFrame of queuedFrames) {
        animationFrame(0);
      }
    });

    await waitFor(() => {
      expect(dialog.style.right).toBe("0px");
      expect(backdrop?.style.opacity).toBe("1");
    });
  });

  it("slides the panel right without moving its viewport positioner on close", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });

    render(
      <SlideOver label="Step details" onClose={() => {}}>
        <SlideOverClose>
          {(close) => (
            <button type="button" onClick={close}>
              Close
            </button>
          )}
        </SlideOverClose>
      </SlideOver>,
    );

    const dialog = screen.getByRole("dialog", { name: "Step details" });
    const positioner = dialog.parentElement as HTMLElement;

    act(() => {
      const queuedFrames = animationFrames.splice(0);
      for (const animationFrame of queuedFrames) {
        animationFrame(0);
      }
    });
    expect(dialog.style.right).toBe("0px");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(positioner.style.inset).toBe("0");
    expect(positioner.style.right).toBe("");
    expect(dialog.style.right).toBe("-960px");
    expect(dialog.style.transition).toBe("right 200ms ease-out");
  });
});
