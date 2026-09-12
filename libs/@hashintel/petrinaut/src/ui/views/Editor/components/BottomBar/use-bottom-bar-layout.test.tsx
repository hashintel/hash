/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { createRef, use, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { EditorContext } from "../../../../../react/state/editor-context";
import { useBottomBarLayout } from "./use-bottom-bar-layout";

const laneRef = createRef<HTMLDivElement>();
const barRef = createRef<HTMLDivElement>();

vi.mock("../../../../../react/hooks/use-element-size", () => ({
  useElementSize: (ref: unknown) => ({ width: ref === laneRef ? 2000 : 600 }),
}));

afterEach(cleanup);

it("centers on the full editor and moves only to clear occupied space", () => {
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
        isAnimating: true,
      }),
    { wrapper },
  );
  expect(result.current.offsetX).toBe(0);
  editor = { ...editor, isAiAssistantOpen: true };
  rerender();
  expect(result.current.offsetX).toBe(0);
  expect(result.current.isCollapsed).toBe(false);

  editor = { ...editor, hasSelection: true };
  rerender();
  expect(result.current.offsetX).toBe(-182);

  editor = { ...editor, aiAssistantPlacement: "floating" };
  rerender();
  expect(result.current.offsetX).toBe(0);

  editor = {
    ...editor,
    aiAssistantPlacement: "docked",
    aiAssistantWidth: 1000,
  };
  rerender();
  expect(result.current.isCollapsed).toBe(true);
  editor = { ...editor, isAiAssistantOpen: false };
  rerender();
  expect(result.current.offsetX).toBe(0);
  expect(result.current.isCollapsed).toBe(false);
});
