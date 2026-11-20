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
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePublished } from "../../../../../../../react/select-from-context";
import {
  EditorContext,
  EditorPublishedContext,
} from "../../../../../../../react/state/editor-context";
import { EntityList } from "./entity-list";

import type { EditorContextValue } from "../../../../../../../react/state/editor-context";
import type { EntityGroup, EntityItem } from "./entity-groups";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

// An entity row reads its selection once each time it renders.
const rowRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock(
  "../../../../../../../react/state/editor-context",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../../../react/state/editor-context")
      >();
    return {
      ...actual,
      useIsSelected: (id: string) => {
        rowRenders.count += 1;
        return actual.useIsSelected(id);
      },
    };
  },
);

// What a row's menu holds is its own; the list decides which rows mount one.
vi.mock("./entity-row-menu", () => ({
  EntityRowMenu: () => (
    <button type="button" aria-label="Row menu">
      …
    </button>
  ),
}));

afterEach(cleanup);

/** A live selection model standing in for the editor's. */
const makeSelectionStub = () => {
  let selection: SelectionMap = new Map();
  const value = {
    get selection() {
      return selection;
    },
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

const renderList = (groups: EntityGroup[]) => {
  const stub = makeSelectionStub();
  const view = render(
    <EditorContext value={stub.value}>
      <EntityList groups={groups} />
    </EditorContext>,
  );
  return { ...stub, view };
};

const groupOf = (children: EntityItem[]): EntityGroup => ({
  id: "group",
  name: "Group",
  emptyGroupMessage: "No rows",
  children,
});

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

const ONE_GROUP = [
  groupOf([
    { id: "a", type: "place", name: "Alpha" },
    { id: "b", type: "place", name: "Beta" },
    { id: "c", type: "place", name: "Gamma" },
  ]),
];

const rowOf = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest("[role='option']");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no option row for ${name}`);
  }
  return row;
};

const menuButtonOf = (name: string) =>
  rowOf(name).querySelector("[aria-label='Row menu']");

describe("filterable list row menus", () => {
  it("mounts no menu until a row is pointed at or focused", () => {
    renderList(ONE_GROUP);

    expect(screen.queryAllByLabelText("Row menu")).toHaveLength(0);
  });

  it("mounts the menu of the row under the pointer, and moves it with the pointer", () => {
    renderList(ONE_GROUP);

    fireEvent.pointerEnter(rowOf("Beta"));
    expect(menuButtonOf("Beta")).not.toBeNull();
    expect(screen.queryAllByLabelText("Row menu")).toHaveLength(1);

    fireEvent.pointerEnter(rowOf("Gamma"));
    expect(menuButtonOf("Gamma")).not.toBeNull();
    expect(screen.queryAllByLabelText("Row menu")).toHaveLength(1);
  });

  it("keeps the menu of the row that holds focus while the pointer is on another", () => {
    renderList(ONE_GROUP);

    fireEvent.pointerEnter(rowOf("Alpha"));
    const button = menuButtonOf("Alpha");
    if (!(button instanceof HTMLElement)) {
      throw new Error("no menu button on the row under the pointer");
    }
    // As when the menu is opened: focus goes to the button, then the pointer
    // moves on to the menu's items, which are drawn outside the row.
    act(() => button.focus());
    fireEvent.pointerEnter(rowOf("Beta"));

    expect(menuButtonOf("Alpha")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(menuButtonOf("Beta")).not.toBeNull();
  });
});

describe("filterable list keyboard flow", () => {
  it("is one tab stop with a roving tabindex over real rows", () => {
    const { view } = renderList(ONE_GROUP);

    expect(view.container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    focusRow("Beta");
    expect(view.container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
  });

  it("selects as arrows move, and extends a range with Shift", () => {
    const { selectedIds } = renderList(ONE_GROUP);

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
    renderList(ONE_GROUP);

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
      groupOf([{ id: "child", type: "place", name: "Child" }]),
      { ...groupOf([]), id: "after", name: "After" },
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

describe("entity list renders", () => {
  const places = Array.from({ length: 50 }, (_, index) => ({
    id: `p${index}`,
    type: "place" as const,
    name: `Place ${index}`,
  }));
  const groups = [groupOf(places)];

  /** The editor as its provider gives it out: the context, and its value published for readers by selector. */
  const Editor = ({
    selectedId,
    children,
  }: {
    selectedId: string;
    children: ReactNode;
  }) => {
    const value = {
      ...makeSelectionStub().value,
      selection: new Map([[selectedId, { type: "place", id: selectedId }]]),
    } as EditorContextValue;
    return (
      <EditorPublishedContext value={usePublished(value)}>
        <EditorContext value={value}>{children}</EditorContext>
      </EditorPublishedContext>
    );
  };

  it("renders the two rows whose selected state changes when the selection moves", () => {
    const list = <EntityList groups={groups} />;
    const view = render(<Editor selectedId="p1">{list}</Editor>);
    expect(rowOf("Place 1").getAttribute("aria-selected")).toBe("true");

    rowRenders.count = 0;
    view.rerender(<Editor selectedId="p2">{list}</Editor>);

    expect(rowOf("Place 1").getAttribute("aria-selected")).toBe("false");
    expect(rowOf("Place 2").getAttribute("aria-selected")).toBe("true");
    expect(rowRenders.count).toBe(2);
  });

  it("renders the two rows whose menu comes and goes when the pointer moves", () => {
    render(
      <Editor selectedId="p1">
        <EntityList groups={groups} />
      </Editor>,
    );
    fireEvent.pointerEnter(rowOf("Place 7"));

    rowRenders.count = 0;
    fireEvent.pointerEnter(rowOf("Place 9"));

    expect(menuButtonOf("Place 9")).not.toBeNull();
    expect(rowRenders.count).toBe(2);
  });
});
