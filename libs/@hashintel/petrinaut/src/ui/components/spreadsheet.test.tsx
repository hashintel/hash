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
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FocusRoot, FocusStack } from "../worksheet/focus-stack";
import { Spreadsheet } from "./spreadsheet";

import type { SpreadsheetCellValue, SpreadsheetColumn } from "./spreadsheet";

afterEach(cleanup);

const COLUMNS: SpreadsheetColumn[] = [
  { id: "x", name: "x" },
  { id: "y", name: "y" },
];

/** Controlled wrapper: `onData` observes every change the grid commits. */
const Harness: React.FC<{
  columns?: SpreadsheetColumn[];
  initial: SpreadsheetCellValue[][];
  onData?: (data: SpreadsheetCellValue[][]) => void;
}> = ({ columns = COLUMNS, initial, onData }) => {
  const [data, setData] = useState(initial);
  return (
    <Spreadsheet
      columns={columns}
      data={data}
      onChange={(next) => {
        setData(next);
        onData?.(next);
      }}
    />
  );
};

const focusPart = (target: HTMLElement): HTMLElement => {
  act(() => {
    target.focus();
  });
  expect(document.activeElement).toBe(target);
  return target;
};

const focusCellShowing = (text: string): HTMLElement =>
  focusPart(screen.getByText(text));

const arrow = (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
  const active = document.activeElement;
  if (!active) {
    throw new Error("nothing holds focus");
  }
  fireEvent.keyDown(active, { key });
};

const expectFocusedText = (text: string) => {
  expect(document.activeElement).toBe(screen.getByText(text));
};

const editorInput = (): HTMLInputElement | null =>
  document.querySelector("input[type='number'], input[type='text']");

describe("Spreadsheet focus flow", () => {
  it("is one tab stop: a roving tabindex marks a single tabbable position", () => {
    const { container } = render(
      <Harness
        initial={[
          [10, 20],
          [30, 40],
        ]}
      />,
    );

    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);

    focusCellShowing("40");
    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    expect(screen.getByText("40")).toHaveProperty("tabIndex", 0);
  });

  it("moves between cells with arrows, and between the gutter and the cells", () => {
    render(
      <Harness
        initial={[
          [10, 20],
          [30, 40],
        ]}
      />,
    );

    focusCellShowing("10");
    arrow("ArrowRight");
    expectFocusedText("20");
    arrow("ArrowDown");
    expectFocusedText("40");
    arrow("ArrowLeft");
    expectFocusedText("30");

    // ArrowLeft from column 0 enters the gutter; the lane walks rows.
    arrow("ArrowLeft");
    const gutters = screen.getAllByRole("rowheader");
    expect(document.activeElement).toBe(gutters[1]);
    arrow("ArrowUp");
    expect(document.activeElement).toBe(gutters[0]);
    arrow("ArrowRight");
    expectFocusedText("10");
  });

  it("does not intercept Tab", () => {
    render(<Harness initial={[[10, 20]]} />);

    const cell = focusCellShowing("10");
    const notPrevented = fireEvent.keyDown(cell, { key: "Tab" });
    expect(notPrevented).toBe(true);
  });

  it("opens the editor on Enter, commits on Enter, and advances to the next cell", () => {
    const onData = vi.fn();
    render(
      <Harness
        initial={[
          [10, 20],
          [30, 40],
        ]}
        onData={onData}
      />,
    );

    focusCellShowing("10");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    const input = editorInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe("10");

    fireEvent.change(input!, { target: { value: "77" } });
    fireEvent.keyDown(input!, { key: "Enter" });

    expect(onData).toHaveBeenLastCalledWith([
      [77, 20],
      [30, 40],
    ]);
    expectFocusedText("20");
  });

  it("cancels the editor on Escape and returns focus to the cell", () => {
    const onData = vi.fn();
    render(<Harness initial={[[10, 20]]} onData={onData} />);

    focusCellShowing("10");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    fireEvent.change(editorInput()!, { target: { value: "99" } });
    fireEvent.keyDown(editorInput()!, { key: "Escape" });

    expect(onData).not.toHaveBeenCalled();
    expectFocusedText("10");
  });

  it("materializes a phantom-row edit as a new row", () => {
    const onData = vi.fn();
    render(<Harness initial={[[10, 20]]} onData={onData} />);

    // The phantom row's cells render empty; typing opens the editor seeded
    // with the pressed key.
    const cells = screen.getAllByRole("button");
    const phantomFirstCell = cells[cells.length - 2]!;
    focusPart(phantomFirstCell);
    fireEvent.keyDown(phantomFirstCell, { key: "5" });
    fireEvent.keyDown(editorInput()!, { key: "Enter" });

    expect(onData).toHaveBeenLastCalledWith([
      [10, 20],
      [5, 0],
    ]);
  });

  it("removes a row on Delete in the gutter and keeps focus in the lane", () => {
    const onData = vi.fn();
    render(
      <Harness
        initial={[
          [10, 20],
          [30, 40],
        ]}
        onData={onData}
      />,
    );

    const gutter = screen.getAllByRole("rowheader")[0]!;
    focusPart(gutter);
    fireEvent.keyDown(gutter, { key: "Delete" });

    expect(onData).toHaveBeenLastCalledWith([[30, 40]]);
    // Index-keyed rows: the same gutter element now heads the next row.
    expect(document.activeElement).toBe(gutter);
  });

  it("ignores Delete on the phantom row's gutter", () => {
    const onData = vi.fn();
    render(<Harness initial={[[10, 20]]} onData={onData} />);

    const phantomGutter = screen.getAllByRole("rowheader")[1]!;
    focusPart(phantomGutter);
    fireEvent.keyDown(phantomGutter, { key: "Delete" });

    expect(onData).not.toHaveBeenCalled();
  });

  it("toggles boolean cells from the keyboard without opening an editor", () => {
    const onData = vi.fn();
    render(
      <Harness
        columns={[{ id: "active", name: "active", type: "boolean" }]}
        initial={[[true]]}
        onData={onData}
      />,
    );

    const cell = screen.getAllByRole("checkbox")[0]!;
    focusPart(cell);
    fireEvent.keyDown(cell, { key: " " });
    expect(onData).toHaveBeenLastCalledWith([[false]]);

    fireEvent.keyDown(cell, { key: "t" });
    expect(onData).toHaveBeenLastCalledWith([[true]]);

    fireEvent.keyDown(cell, { key: "x" });
    expect(editorInput()).toBeNull();
  });

  it("selects on the first click and opens the editor on a click on the selected cell", () => {
    render(<Harness initial={[[10, 20]]} />);

    const cell = screen.getByText("10");
    fireEvent.pointerDown(cell);
    focusPart(cell);
    fireEvent.click(cell, { detail: 1 });
    expect(editorInput()).toBeNull();

    fireEvent.pointerDown(cell);
    fireEvent.click(cell, { detail: 1 });
    expect(editorInput()).not.toBeNull();
    expect(editorInput()!.value).toBe("10");
  });

  it("hands an edge move to the enclosing stack, flowing into a sibling grid", () => {
    render(
      <FocusRoot>
        <FocusStack axis="vertical">
          <Harness initial={[[10, 20]]} />
          <Harness initial={[[50, 60]]} />
        </FocusStack>
      </FocusRoot>,
    );

    // From the first grid's phantom row, ArrowDown crosses into the second
    // grid; ArrowUp from there returns.
    focusCellShowing("10");
    arrow("ArrowDown"); // phantom row
    arrow("ArrowDown"); // crosses grids
    expectFocusedText("50");
    arrow("ArrowUp");
    arrow("ArrowUp");
    expectFocusedText("10");
  });
});
