/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type PetrinautRules,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../react/document/composition-context";
import { PetrinautInstanceContext } from "../../../../../react/document/instance-context";
import { UndoRedoContext } from "../../../../../react/document/undo-redo-context";
import { constantStore } from "../../../../../react/shared/use-store";
import { EditorContext } from "../../../../../react/state/editor-context";
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
vi.mock("../../../../../react/editing/use-read-only-feedback", () => ({
  useReadOnlyFeedback: () => actions.notify,
}));
vi.mock("../../../../../react/editing/use-is-read-only", () => ({
  useIsReadOnly: () => actions.readOnly,
}));
vi.mock(
  import("../../../../../react/editing/use-read-only-reason"),
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
});

const emptyNet = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const createInstance = (rules?: PetrinautRules) =>
  createPetrinaut({
    document: createJsonDocHandle({ initial: emptyNet }),
    rules,
  });
const plainInstance = createInstance();

const BoundShortcuts = () => {
  useKeyboardShortcuts();
  return <input aria-label="Search" />;
};
/** The shortcuts, on a plain instance unless a test mounts its own. */
const Shortcuts = () => (
  <PetrinautInstanceContext
    value={use(PetrinautInstanceContext) ?? plainInstance}
  >
    <EditorContext
      value={{ ...use(EditorContext), setEditionMode: actions.mode }}
    >
      <BoundShortcuts />
    </EditorContext>
  </PetrinautInstanceContext>
);
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

test("the place and transition shortcuts do nothing in an editor that only composes", () => {
  actions.readOnly = false;
  const Composing = ({ children }: { children: ReactNode }) => (
    <CompositionContext
      value={{ ...use(CompositionContext), rules: { edit: "compose" } }}
    >
      {children}
    </CompositionContext>
  );
  render(<Shortcuts />, { wrapper: Composing });

  fireEvent.keyDown(document.body, { key: "n" });
  fireEvent.keyDown(document.body, { key: "t" });

  expect(actions.mode).not.toHaveBeenCalled();
  expect(actions.notify).not.toHaveBeenCalled();
});

/** An editor that only composes, on the root net or a component, with one item selected. */
const composing = (selected: SelectionItem, activeComponentId?: string) => {
  const instance = createInstance({ edit: "compose" });
  const clearSelection = vi.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <PetrinautInstanceContext value={instance}>
      <ActiveNetContext
        value={{
          ...use(ActiveNetContext),
          activeComponentId: activeComponentId ?? null,
        }}
      >
        <EditorContext
          value={{
            ...use(EditorContext),
            hasSelection: true,
            selection: new Map([[selected.id, selected]]),
            clearSelection,
          }}
        >
          {children}
        </EditorContext>
      </ActiveNetContext>
    </PetrinautInstanceContext>
  );
  return { Wrapper, clearSelection };
};

test("a delete the host's rules refuse leaves the selection as it is", () => {
  actions.readOnly = false;
  const { Wrapper, clearSelection } = composing({ type: "place", id: "place" });
  render(<Shortcuts />, { wrapper: Wrapper });

  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(actions.remove).toHaveBeenCalledOnce();
  expect(clearSelection).not.toHaveBeenCalled();
});

test("a delete the host's rules allow clears the selection", () => {
  actions.readOnly = false;
  const { Wrapper, clearSelection } = composing({
    type: "componentInstance",
    id: "instance",
  });
  render(<Shortcuts />, { wrapper: Wrapper });

  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(actions.remove).toHaveBeenCalledOnce();
  expect(clearSelection).toHaveBeenCalledOnce();
});

test("a delete is asked about with the net it is aimed at", () => {
  actions.readOnly = false;
  // An instance can be deleted from the root net, and from no component.
  const { Wrapper, clearSelection } = composing(
    { type: "componentInstance", id: "instance" },
    "component",
  );
  render(<Shortcuts />, { wrapper: Wrapper });

  fireEvent.keyDown(document.body, { key: "Delete" });
  expect(actions.remove).toHaveBeenCalledOnce();
  expect(clearSelection).not.toHaveBeenCalled();
});

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
        canUndo: constantStore(true),
        canRedo: constantStore(false),
        history: constantStore({ entries: [], currentIndex: 0 }),
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
