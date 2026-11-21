/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import {
  SearchContent,
  SearchQueryProvider,
  SearchTitle,
} from "./search-panel";

import type { Place, Transition } from "@hashintel/petrinaut-core";

// A result row reads its selection once each time it renders.
const rowRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock(
  "../../../../../../react/state/editor-context",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../../react/state/editor-context")
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

afterEach(cleanup);

const place = (id: string, name: string): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const transition = (id: string, name: string): Transition => ({
  id,
  name,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const selectItem = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

const Wrapper = ({ children }: { children: ReactNode }) => {
  const document = use(SDCPNContext);
  return (
    <SDCPNContext
      value={{
        ...document,
        petriNetDefinition: {
          ...document.petriNetDefinition,
          places: [place("p1", "Warehouse"), place("p2", "Workshop")],
          transitions: [transition("t1", "Ship wares")],
        },
      }}
    >
      <EditorContext value={{ ...use(EditorContext), selectItem }}>
        <FocusRoot>
          <FocusStack axis="vertical">
            <SearchQueryProvider>{children}</SearchQueryProvider>
          </FocusStack>
        </FocusRoot>
      </EditorContext>
    </SDCPNContext>
  );
};

/** The search panel as its sub-view lays it out: the input in the header, the results below. */
const renderSearch = () =>
  render(
    <>
      <SearchTitle />
      <SearchContent />
    </>,
    { wrapper: Wrapper },
  );

const type = (query: string): HTMLElement => {
  const input = screen.getByPlaceholderText("Find anything…");
  fireEvent.input(input, { target: { value: query } });
  return input;
};

const resultNames = () =>
  screen.queryAllByRole("option").map((row) => row.textContent);

describe("search panel", () => {
  it("lists nothing until a query is typed", () => {
    renderSearch();

    expect(resultNames()).toEqual([]);
    expect(screen.queryByText(/match/)).toBeNull();
  });

  it("lists the entities whose name matches, with their count and category", () => {
    renderSearch();

    type("war");

    expect(screen.getByText("2 matches")).toBeTruthy();
    expect(resultNames().sort()).toEqual(["Ship waresNode", "WarehouseNode"]);
  });

  it("says so when nothing matches", () => {
    renderSearch();

    type("zzz");

    expect(screen.getByText("0 matches")).toBeTruthy();
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("reaches the results with ArrowDown, selects as arrows move, and returns to the input", () => {
    renderSearch();
    const input = type("work");
    input.focus();

    fireEvent.keyDown(input, { key: "ArrowDown" });

    const [first] = screen.getAllByRole("option");
    expect(document.activeElement).toBe(first);
    expect(selectItem).toHaveBeenLastCalledWith({ type: "place", id: "p2" });

    fireEvent.keyDown(first!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(input);
  });

  it("renders at most the two rows focus moves between", () => {
    renderSearch();
    const input = type("w");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });

    rowRenders.count = 0;
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });

    expect(document.activeElement).toBe(screen.getAllByRole("option")[1]);
    expect(rowRenders.count).toBeLessThanOrEqual(2);
  });

  it("selects the result that is clicked", () => {
    renderSearch();
    type("ship");

    fireEvent.click(screen.getByRole("option"));

    expect(selectItem).toHaveBeenLastCalledWith({
      type: "transition",
      id: "t1",
    });
  });
});
