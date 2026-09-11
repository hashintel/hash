/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { EditorContext } from "../../../../../react/state/editor-context";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const actions = vi.hoisted(() => ({
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
afterEach(() => {
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
