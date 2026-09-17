/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  BottomBarCollapseContext,
  type BottomBarCollapseValue,
} from "./collapse-context";
import { CollapsibleGroup } from "./collapsible-group";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the expanded bar width constant through fractional grid frames", () => {
  let notifyResize = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this);
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );

  const reportGroupWidth = vi.fn<BottomBarCollapseValue["reportGroupWidth"]>();
  const { container } = render(
    <BottomBarCollapseContext value={{ isCollapsed: true, reportGroupWidth }}>
      <CollapsibleGroup>
        <button type="button">Control</button>
      </CollapsibleGroup>
    </BottomBarCollapseContext>,
  );
  const group = container.firstElementChild;
  const clip = group?.firstElementChild;
  const content = clip?.firstElementChild;
  if (
    !(group instanceof HTMLElement) ||
    !(clip instanceof HTMLElement) ||
    !(content instanceof HTMLElement)
  ) {
    throw new Error("Collapsible group elements are missing");
  }

  const naturalWidth = 130;
  const fixedBarWidth = 215;
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, naturalWidth, 32),
  );
  const measureGroup = vi.spyOn(group, "getBoundingClientRect");
  const measureClip = vi.spyOn(clip, "getBoundingClientRect");

  for (const progress of [0, 0.25, 0.5, 0.75, 1, 0.5, 0]) {
    const renderedWidth = naturalWidth * progress;
    measureGroup.mockReturnValue(new DOMRect(0, 0, renderedWidth, 32));
    measureClip.mockReturnValue(
      new DOMRect(0, 0, renderedWidth * progress, 32),
    );
    act(notifyResize);

    const reportedWidth = reportGroupWidth.mock.lastCall?.[1];
    expect(reportedWidth?.natural).toBe(naturalWidth);
    expect(fixedBarWidth + renderedWidth + (reportedWidth?.hidden ?? 0)).toBe(
      fixedBarWidth + naturalWidth,
    );
  }
});
