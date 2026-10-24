/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { EditorContext } from "../../../../../react/state/editor-context";
import { UndoRedoContext } from "../../../../../react/state/undo-redo-context";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const actions = vi.hoisted(() => ({
  readOnly: true,
  reason: "host-readonly" as "host-readonly" | "simulate-mode",
  undo: vi.fn(),
  notify: vi.fn(),
  remove: vi.fn(),
  paste: vi.fn(),
  mode: vi.fn(),
}));
vi.mock("../../../../../react", () => ({
  usePetrinautMutations: () => ({ deleteItemsByIds: actions.remove }),
  usePetrinautCommands: () => ({ applyClipboardPaste: actions.paste }),
}));
vi.mock("../../../../../react/hooks/use-read-only-feedback", () => ({
  useReadOnlyFeedback: () => actions.notify,
}));
vi.mock("../../../../../react/state/use-is-read-only", () => ({
  useIsReadOnly: () => actions.readOnly,
}));
vi.mock(
  import("../../../../../react/state/use-read-only-reason"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    useReadOnlyReason: () =>
      actions.readOnly ? { kind: actions.reason } : null,
  }),
);
afterEach(() => {
  actions.readOnly = true;
  actions.reason = "host-readonly";
  cleanup();
  vi.clearAllMocks();
});

const Shortcuts = () => {
  useKeyboardShortcuts("edit", actions.mode, () => {});
  return <input aria-label="Search" />;
};
const Selection = ({ children }: { children: ReactNode }) => {
  const defaults = use(EditorContext);
  return (
    <EditorContext
      value={{
        ...defaults,
        hasSelection: true,
        selection: new Map([["place", { type: "place", id: "place" }]]),
      }}
    >
      {children}
    </EditorContext>
  );
};

test.each([
  { key: "Delete" },
  { key: "Backspace" },
  { key: "n" },
  { key: "t" },
  { key: "v", metaKey: true },
  { key: "z", metaKey: true },
  { key: "z", ctrlKey: true, shiftKey: true },
])(
  "explains the blocked $key shortcut without changing the document",
  (key) => {
    render(
      <Selection>
        <Shortcuts />
      </Selection>,
    );
    fireEvent.keyDown(document.body, key);
    expect(actions.notify).toHaveBeenCalledOnce();
    expect(actions.remove).not.toHaveBeenCalled();
    expect(actions.paste).not.toHaveBeenCalled();
    expect(actions.mode).not.toHaveBeenCalled();
  },
);

test("typing and selection shortcuts stay quiet", () => {
  render(
    <Selection>
      <Shortcuts />
    </Selection>,
  );
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "n" });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Backspace" });
  fireEvent.keyDown(document.body, { key: "v" });
  expect(actions.notify).not.toHaveBeenCalled();
  expect(actions.mode).toHaveBeenCalledWith("cursor");
});

test.each([
  { metaKey: true },
  { ctrlKey: true },
  { metaKey: true, shiftKey: true },
])(
  "leaves native undo and redo available without an editor history adapter (%j)",
  (modifiers) => {
    actions.readOnly = false;
    render(<Shortcuts />);
    const event = new KeyboardEvent("keydown", {
      ...modifiers,
      key: "z",
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document.body, event);
    expect(event.defaultPrevented).toBe(false);
    expect(actions.notify).not.toHaveBeenCalled();
  },
);

test("undoes in Simulate mode, where scenario and metric edits can be undone", () => {
  actions.reason = "simulate-mode";
  render(
    <UndoRedoContext
      value={{
        undo: actions.undo,
        redo: vi.fn(),
        canUndo: true,
        canRedo: false,
        history: [],
        currentIndex: 0,
        goToIndex: vi.fn(),
      }}
    >
      <Shortcuts />
    </UndoRedoContext>,
  );
  fireEvent.keyDown(document.body, { key: "z", metaKey: true });
  expect(actions.undo).toHaveBeenCalledOnce();
  expect(actions.notify).not.toHaveBeenCalled();
});

test.each(["metaKey", "ctrlKey"])(
  "leaves modified Find shortcuts available to plugins (%s)",
  (modifier) => {
    render(<Shortcuts />);
    for (const extra of [{ shiftKey: true }, { altKey: true }]) {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        [modifier]: true,
        ...extra,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(document.body, event);
      expect(event.defaultPrevented).toBe(false);
    }
    const find = new KeyboardEvent("keydown", {
      key: "f",
      [modifier]: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(document.body, find);
    expect(find.defaultPrevented).toBe(true);
  },
);
