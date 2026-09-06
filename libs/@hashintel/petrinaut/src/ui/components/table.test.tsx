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

import { Table } from "./table";

import type { TableColumn } from "./table";

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
}

const COLUMNS: TableColumn<Row>[] = [
  { id: "name", header: "Name", render: (row) => row.name },
];

const ROWS: Row[] = [
  { id: "one", name: "First" },
  { id: "two", name: "Second" },
  { id: "three", name: "Third" },
];

const rowShowing = (text: string): HTMLElement => {
  const target = screen.getByText(text).closest("[role='row']");
  if (!(target instanceof HTMLElement)) {
    throw new Error(`no row for ${text}`);
  }
  return target;
};

const focusRow = (text: string): HTMLElement => {
  const target = rowShowing(text);
  act(() => {
    target.focus();
  });
  expect(document.activeElement).toBe(target);
  return target;
};

describe("Table keyboard flow", () => {
  it("is one tab stop whose rows the arrows walk", () => {
    const { container } = render(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        emptyLabel="Empty"
        onRowSelect={() => {}}
      />,
    );

    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);

    focusRow("First");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rowShowing("Second"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rowShowing("Third"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rowShowing("Second"));

    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
  });

  it("activates select-first: the first click selects, the second opens", () => {
    const onRowSelect = vi.fn();
    render(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        emptyLabel="Empty"
        onRowSelect={onRowSelect}
      />,
    );

    const row = rowShowing("Second");
    fireEvent.pointerDown(row);
    focusRow("Second");
    fireEvent.click(row, { detail: 1 });
    expect(onRowSelect).not.toHaveBeenCalled();

    fireEvent.pointerDown(row);
    fireEvent.click(row, { detail: 1 });
    expect(onRowSelect).toHaveBeenCalledWith(ROWS[1]);
  });

  it("activates on Enter and Space", () => {
    const onRowSelect = vi.fn();
    render(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        emptyLabel="Empty"
        onRowSelect={onRowSelect}
      />,
    );

    focusRow("First");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onRowSelect).toHaveBeenLastCalledWith(ROWS[0]);
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(onRowSelect).toHaveBeenCalledTimes(2);
  });

  it("renders inert rows without onRowSelect", () => {
    const { container } = render(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        emptyLabel="Empty"
      />,
    );

    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});
