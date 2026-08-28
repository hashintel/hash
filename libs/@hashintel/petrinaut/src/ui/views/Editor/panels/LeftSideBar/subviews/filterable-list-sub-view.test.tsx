/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { createFilterableListSubView } from "./filterable-list-sub-view";

import type { EditorContextValue } from "../../../../../../react/state/editor-context";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";

afterEach(cleanup);

interface TestItem {
  id: string;
  name: string;
  children?: TestItem[];
  emptyGroupMessage?: string;
  renderGroupAction?: React.ComponentType;
}

/** A live selection model standing in for the editor's. */
const makeSelectionStub = () => {
  let selection: SelectionMap = new Map();
  const value = {
    isSelected: (id: string) => selection.has(id),
    selectItem: (item: SelectionItem) => {
      selection = new Map([[item.id, item]]);
    },
    toggleItem: (item: SelectionItem) => {
      const next = new Map(selection);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.set(item.id, item);
      }
      selection = next;
    },
    clearSelection: () => {
      selection = new Map();
    },
    setSelection: (
      next: SelectionMap | ((prev: SelectionMap) => SelectionMap),
    ) => {
      selection = typeof next === "function" ? next(selection) : next;
    },
    setSearchOpen: () => {},
  } as unknown as EditorContextValue;
  return { value, selectedIds: () => [...selection.keys()].sort() };
};

const renderList = (items: TestItem[]) => {
  const stub = makeSelectionStub();
  const subView = createFilterableListSubView<TestItem>({
    id: "test-list",
    title: "Test",
    useItems: () => items,
    getSelectionItem: (item) => ({ type: "place", id: item.id }),
    renderItem: (item) => item.name,
    renderRowMenu: () => (
      <button type="button" aria-label="Row menu">
        …
      </button>
    ),
    emptyMessage: "Nothing here",
  });
  const Component = subView.component;
  const view = render(
    <EditorContext value={stub.value}>
      <Component />
    </EditorContext>,
  );
  return { ...stub, view };
};

const focusRow = (name: string): HTMLElement => {
  const target = screen.getByText(name).closest("[role='option']");
  if (!(target instanceof HTMLElement)) {
    throw new Error(`no option row for ${name}`);
  }
  act(() => {
    target.focus();
  });
  expect(document.activeElement).toBe(target);
  return target;
};

const key = (pressed: string, init?: { shiftKey?: boolean }) => {
  fireEvent.keyDown(document.activeElement!, { key: pressed, ...init });
};

const FLAT_ITEMS: TestItem[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];

describe("filterable list keyboard flow", () => {
  it("is one tab stop with a roving tabindex over real rows", () => {
    const { view } = renderList(FLAT_ITEMS);

    expect(view.container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    focusRow("Beta");
    expect(view.container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
  });

  it("selects as arrows move, and extends a range with Shift", () => {
    const { selectedIds } = renderList(FLAT_ITEMS);

    focusRow("Alpha");
    key("Enter");
    expect(selectedIds()).toEqual(["a"]);

    key("ArrowDown");
    expect(document.activeElement?.textContent).toContain("Beta");
    expect(selectedIds()).toEqual(["b"]);

    key("ArrowDown", { shiftKey: true });
    expect(document.activeElement?.textContent).toContain("Gamma");
    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("reaches the row menu with ArrowRight and returns with ArrowLeft", () => {
    renderList(FLAT_ITEMS);

    const row = focusRow("Alpha");
    key("ArrowRight");
    expect(document.activeElement).toBe(
      row.querySelector("[aria-label='Row menu']"),
    );
    key("ArrowLeft");
    expect(document.activeElement).toBe(row);
  });

  it("collapses a group with ArrowLeft and skips its hidden children", () => {
    renderList([
      {
        id: "group",
        name: "Group",
        children: [{ id: "child", name: "Child" }],
      },
      { id: "after", name: "After" },
    ]);

    focusRow("Group");
    key("ArrowLeft");
    key("ArrowDown");
    expect(document.activeElement?.textContent).toContain("After");

    key("ArrowUp");
    key("ArrowRight");
    key("ArrowDown");
    expect(document.activeElement?.textContent).toContain("Child");
  });
});
