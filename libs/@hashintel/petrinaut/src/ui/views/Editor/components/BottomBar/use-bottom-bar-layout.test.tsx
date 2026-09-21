/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef, use, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { EditorContext } from "../../../../../react/state/editor-context";
import { useBottomBarLayout } from "./use-bottom-bar-layout";

const laneRef = createRef<HTMLDivElement>();
const barRef = createRef<HTMLDivElement>();
let laneWidth = 2000;

vi.mock("../../../../../react/hooks/use-element-size", () => ({
  useElementSize: (ref: unknown) => ({
    width: ref === laneRef ? laneWidth : 600,
  }),
}));

afterEach(cleanup);

it("centers in the available main view as sibling panels resize it", () => {
  const defaults = renderHook(() => use(EditorContext)).result.current;
  let editor = {
    ...defaults,
    isLeftSidebarOpen: false,
    isSearchOpen: false,
    hasSelection: false,
    isAiAssistantOpen: false,
    isAiAssistantCollapsed: false,
    aiAssistantPlacement: "docked" as "docked" | "floating",
    aiAssistantWidth: 420,
    propertiesPanelWidth: 450,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorContext value={editor}>{children}</EditorContext>
  );
  const { result, rerender } = renderHook(
    () =>
      useBottomBarLayout(laneRef, barRef, {
        hasViewportControls: false,
      }),
    { wrapper },
  );
  expect(result.current.offsetX).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? editor.propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  editor = { ...editor, isAiAssistantOpen: true };
  laneWidth = 1580;
  rerender();
  expect(result.current.offsetX).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? editor.propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  expect(result.current.isCollapsed).toBe(false);

  editor = { ...editor, hasSelection: true };
  laneWidth = 1200;
  rerender();
  expect(result.current.offsetX).toBe(
    "max(calc(-588px + 50%), min(0px, calc(138px - 50%)))",
  );

  editor = { ...editor, aiAssistantPlacement: "floating" };
  laneWidth = 2000;
  rerender();
  expect(result.current.offsetX).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? editor.propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );

  editor = {
    ...editor,
    aiAssistantPlacement: "docked",
    aiAssistantWidth: 1000,
  };
  laneWidth = 1000;
  rerender();
  expect(result.current.isCollapsed).toBe(true);
  editor = { ...editor, isAiAssistantOpen: false };
  laneWidth = 2000;
  rerender();
  expect(result.current.offsetX).toBe(
    `max(calc(${12 - laneWidth / 2}px + 50%), min(0px, calc(${laneWidth / 2 - (editor.hasSelection ? editor.propertiesPanelWidth : 0) - 12}px - 50%)))`,
  );
  expect(result.current.isCollapsed).toBe(false);
});

it("keeps horizontal placement unchanged when a panel moves a hover-expanded bar vertically", () => {
  laneWidth = 1000;
  const defaults = renderHook(() => use(EditorContext)).result.current;
  let editor = {
    ...defaults,
    isLeftSidebarOpen: true,
    leftSidebarWidth: 220,
    hasSelection: true,
    propertiesPanelWidth: 600,
    isBottomPanelOpen: false,
    isPanelAnimating: false,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorContext value={editor}>{children}</EditorContext>
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
  const offset = result.current.offsetX;
  for (const isBottomPanelOpen of [true, false]) {
    editor = { ...editor, isBottomPanelOpen, isPanelAnimating: true };
    rerender();
    expect(result.current.offsetX).toBe(offset);
    expect(result.current.liftY).toBe(
      isBottomPanelOpen ? editor.bottomPanelHeight : 0,
    );
    editor = { ...editor, isPanelAnimating: false };
    rerender();
    expect(result.current.offsetX).toBe(offset);
  }
});
