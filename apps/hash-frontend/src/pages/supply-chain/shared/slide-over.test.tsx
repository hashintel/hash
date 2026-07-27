// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlideOver } from "./slide-over";

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
    expect(positioner.style.right).toBe("-960px");
    expect(backdrop?.style.opacity).toBe("0");

    act(() => {
      const queuedFrames = animationFrames.splice(0);
      for (const animationFrame of queuedFrames) {
        animationFrame(0);
      }
    });

    await waitFor(() => {
      expect(positioner.style.right).toBe("0px");
      expect(backdrop?.style.opacity).toBe("1");
    });
  });
});
