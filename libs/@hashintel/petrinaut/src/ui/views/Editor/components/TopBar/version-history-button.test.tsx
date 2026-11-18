/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import {
  UndoRedoContext,
  type UndoHistory,
} from "../../../../../react/state/undo-redo-context";
import { constantStore } from "../../../../../react/use-store";
import { VersionHistoryButton } from "./version-history-button";

// The menu's popup positions itself with an observer jsdom does not have.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const entryAt = (second: number) => ({
  timestamp: new Date(2026, 0, 1, 12, 0, second).toISOString(),
});

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Recent changes" }));
const listed = () => screen.findAllByText(/^12:00:0\d$/);

const renderButton = () => {
  const history = createReadableStore<UndoHistory>({
    entries: [entryAt(1), entryAt(2), entryAt(3)],
    currentIndex: 2,
  });
  const onRender = vi.fn();
  render(
    <UndoRedoContext
      value={{
        undo: vi.fn(),
        redo: vi.fn(),
        goToIndex: vi.fn(),
        canUndo: constantStore(true),
        canRedo: constantStore(false),
        history,
      }}
    >
      <Profiler id="button" onRender={onRender}>
        <VersionHistoryButton />
      </Profiler>
    </UndoRedoContext>,
  );
  return { history, onRender };
};

it("renders nothing as entries are added while the menu is closed", () => {
  const { history, onRender } = renderButton();
  onRender.mockClear();

  history.set({
    entries: [entryAt(1), entryAt(2), entryAt(3), entryAt(4)],
    currentIndex: 3,
  });

  expect(onRender).not.toHaveBeenCalled();
});

it("lists the entries, newest first, once the menu opens", async () => {
  renderButton();

  open();

  expect((await listed()).map((item) => item.textContent)).toEqual([
    "12:00:03",
    "12:00:02",
    "12:00:01",
  ]);
});

it("follows an entry added while the menu is open", async () => {
  const { history } = renderButton();
  open();
  await listed();

  act(() =>
    history.set({
      entries: [entryAt(1), entryAt(2), entryAt(3), entryAt(4)],
      currentIndex: 3,
    }),
  );

  expect(await listed()).toHaveLength(4);
});
