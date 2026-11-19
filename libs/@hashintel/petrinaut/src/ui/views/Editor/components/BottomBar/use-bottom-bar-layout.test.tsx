/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef, use, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { EditorContext } from "../../../../../react/state/editor-context";
import {
  createPanelSizes,
  defaultPanelSizes,
} from "../../../../../react/state/panel-sizes";
import { PanelSizesContext } from "../../../../../react/state/panel-sizes-context";
import { useBottomBarLayout } from "./use-bottom-bar-layout";

const laneRef = createRef<HTMLDivElement>();
const barRef = createRef<HTMLDivElement>();
let laneWidth = 2000;

vi.mock("../../../../../react/hooks/use-element-size", () => ({
  useElementSize: (ref: unknown) => ({
    width: ref === laneRef ? laneWidth : 600,
  }),
}));

// The hook writes the bar's place on the bar element.
const placement = () =>
  /^translate\((.*), (-?[\d.]+)px\)$/.exec(barRef.current!.style.transform)!;
const offsetX = () => placement()[1];
const liftY = () => 0 - Number(placement()[2]);

beforeEach(() => {
  barRef.current = document.createElement("div");
});
afterEach(cleanup);

it("centers in the available main view as sibling panels resize it", () => {
  const { propertiesPanelWidth } = defaultPanelSizes;
  const defaults = renderHook(() => use(EditorContext)).result.current;
  let editor = {
    ...defaults,
    isLeftSidebarOpen: false,
    isSearchOpen: false,
    hasSelection: false,
    isAiAssistantOpen: false,
    isAiAssistantCollapsed: false,
  };
  const panelSizes = createPanelSizes();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PanelSizesContext value={panelSizes}>
      <EditorContext value={editor}>{children}</EditorContext>
    </PanelSizesContext>
  );
  const { result, rerender } = renderHook(
    () =>
      useBottomBarLayout(laneRef, barRef, {
        hasViewportControls: false,
      }),
    { wrapper },
  );
  expect(offsetX()).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  editor = { ...editor, isAiAssistantOpen: true };
  laneWidth = 1580;
  rerender();
  expect(offsetX()).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  expect(result.current.isCollapsed).toBe(false);

  editor = { ...editor, hasSelection: true };
  laneWidth = 1200;
  rerender();
  expect(offsetX()).toBe(
    "max(calc(-588px + 50%), min(0px, calc(138px - 50%)))",
  );

  editor = { ...editor };
  laneWidth = 2000;
  rerender();
  expect(offsetX()).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );

  editor = { ...editor };
  act(() => panelSizes.aiAssistantWidth.set(1000));
  laneWidth = 1000;
  rerender();
  expect(result.current.isCollapsed).toBe(true);
  editor = { ...editor, isAiAssistantOpen: false };
  laneWidth = 2000;
  rerender();
  expect(offsetX()).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  expect(result.current.isCollapsed).toBe(false);
});

it("keeps horizontal placement unchanged when a panel moves a hover-expanded bar vertically", () => {
  laneWidth = 1000;
  const defaults = renderHook(() => use(EditorContext)).result.current;
  let editor = {
    ...defaults,
    isLeftSidebarOpen: true,
    hasSelection: true,
    isBottomPanelOpen: false,
  };
  const panelSizes = createPanelSizes({
    leftSidebarWidth: 220,
    propertiesPanelWidth: 600,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PanelSizesContext value={panelSizes}>
      <EditorContext value={editor}>{children}</EditorContext>
    </PanelSizesContext>
  );
  const { result, rerender } = renderHook(
    () => useBottomBarLayout(laneRef, barRef, { hasViewportControls: true }),
    { wrapper },
  );
  act(() =>
    result.current.reportGroupWidth("hovered-controls", {
      natural: 385,
      rendered: 385,
    }),
  );
  expect(result.current.isCollapsed).toBe(true);
  const offset = offsetX();
  for (const isBottomPanelOpen of [true, false]) {
    editor = { ...editor, isBottomPanelOpen };
    rerender();
    expect(offsetX()).toBe(offset);
    expect(liftY()).toBe(
      isBottomPanelOpen ? defaultPanelSizes.bottomPanelHeight : 0,
    );
    editor = { ...editor };
    rerender();
    expect(offsetX()).toBe(offset);
  }
});
