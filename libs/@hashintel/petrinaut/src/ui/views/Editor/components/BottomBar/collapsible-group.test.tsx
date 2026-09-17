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

it("keeps the expanded bar width constant during folding and content resizing", () => {
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
  const measureContent = vi
    .spyOn(content, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, 0, naturalWidth, 32));
  const measureGroup = vi.spyOn(group, "getBoundingClientRect");
  for (const progress of [0, 0.25, 0.5, 0.75, 1, 1.5, 0.5, 0]) {
    const renderedWidth = naturalWidth * progress;
    measureGroup.mockReturnValue(new DOMRect(0, 0, renderedWidth, 32));
    act(notifyResize);

    const reportedWidth = reportGroupWidth.mock.lastCall?.[1];
    expect(reportedWidth?.natural).toBe(naturalWidth);
    expect(reportedWidth?.rendered).toBe(renderedWidth);
    expect(
      fixedBarWidth +
        renderedWidth +
        (reportedWidth?.natural ?? 0) -
        (reportedWidth?.rendered ?? 0),
    ).toBe(fixedBarWidth + naturalWidth);
  }

  measureContent.mockReturnValue(new DOMRect(0, 0, 400, 32));
  measureGroup.mockReturnValue(new DOMRect(0, 0, 130, 32));
  act(notifyResize);
  expect(reportGroupWidth.mock.lastCall?.[1]).toEqual({
    natural: 400,
    rendered: 130,
  });
  expect(group.style.getPropertyValue("--group-width")).toBe("400px");

  measureContent.mockReturnValue(new DOMRect(0, 0, 32, 32));
  act(notifyResize);
  expect(reportGroupWidth.mock.lastCall?.[1]).toEqual({
    natural: 32,
    rendered: 130,
  });
  expect(group.style.getPropertyValue("--group-width")).toBe("32px");
});
