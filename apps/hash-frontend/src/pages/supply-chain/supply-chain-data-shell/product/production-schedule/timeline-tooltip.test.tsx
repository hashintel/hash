// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineTooltip } from "./timeline-tooltip";

const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect =>
  ({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TimelineTooltip", () => {
  it("associates read-only tooltip content with the focused trigger", async () => {
    render(
      <TimelineTooltip content="Batch details" delayMs={0}>
        <button type="button">Batch marker</button>
      </TimelineTooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Batch marker" });
    trigger.parentElement!.getBoundingClientRect = () => rect(200, 200, 20, 20);

    fireEvent.focus(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(tooltip.querySelector("button, a, input, select")).toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '[data-timeline-tooltip-surface="true"]',
      )?.className,
    ).toBeTruthy();
  });

  it("dismisses on Escape and when the pointer leaves the trigger", async () => {
    render(
      <TimelineTooltip content="Dismissible tooltip" delayMs={0}>
        <button type="button">Dismissible trigger</button>
      </TimelineTooltip>,
    );
    const trigger = screen.getByRole("button", {
      name: "Dismissible trigger",
    });
    const wrapper = trigger.parentElement!;
    wrapper.getBoundingClientRect = () => rect(390, 300, 40, 20);

    fireEvent.mouseEnter(wrapper, { clientX: 410 });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

    fireEvent.mouseEnter(wrapper, { clientX: 410 });
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.mouseLeave(wrapper);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("positions the overlay and keeps it open for pointer interaction", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getRect(this: HTMLElement) {
        if (this.dataset.timelineTooltip === "true") {
          return rect(260, 100, 300, 200);
        }
        return rect(0, 0, 0, 0);
      },
    );
    render(
      <TimelineTooltip content="Stable tooltip" delayMs={0}>
        <button type="button">Stable trigger</button>
      </TimelineTooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Stable trigger" });
    trigger.parentElement!.getBoundingClientRect = () => rect(390, 300, 40, 20);

    fireEvent.mouseEnter(trigger.parentElement!, { clientX: 410 });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.style.left).toBe("260px");
    expect(tooltip.style.top).toBe("100px");
    expect(getComputedStyle(tooltip).pointerEvents).not.toBe("none");

    fireEvent.mouseLeave(trigger.parentElement!);
    fireEvent.mouseEnter(tooltip);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(screen.getByRole("tooltip")).toBe(tooltip);

    fireEvent.scroll(tooltip);
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.mouseLeave(tooltip);
    fireEvent.pointerMove(document, { clientX: 800, clientY: 800 });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
});
