// @vitest-environment jsdom

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CompactSelection,
  getDefaultTheme,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { ThemeProvider } from "@mui/material";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { renderDataTypeTreeCell } from "../../pages/shared/types-table/data-type-tree-cell";
import { Grid } from "./grid";

import type * as DataGridModule from "@glideapps/glide-data-grid";

const editor = vi.hoisted(() => ({
  props: undefined as DataGridModule.DataEditorProps | undefined,
}));
vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = await importOriginal<typeof DataGridModule>();
  const { Box } = await import("@mui/material");
  return {
    ...actual,
    DataEditor: (props: DataGridModule.DataEditorProps) => {
      editor.props = props;
      return <Box className="dvn-scroller" />;
    },
  };
});
vi.mock("./utils/use-draw-header", () => ({ useDrawHeader: () => undefined }));
vi.mock("./utils/column-filter-menu", () => ({ ColumnFilterMenu: () => null }));
vi.mock("./utils/conversion-menu", () => ({ ConversionMenu: () => null }));

const rows = [
  { rowId: "number", title: "Number" },
  { rowId: "meters", title: "Meters" },
];
const columns = [{ id: "title", title: "Title", width: 200 }];
const grid = (
  searchProps: Pick<
    DataGridModule.DataEditorProps,
    "searchValue" | "onSearchValueChange" | "onSearchClose"
  > & { rows?: typeof rows; preserveCurrentCell?: boolean } = {},
) => (
  <ThemeProvider theme={theme}>
    <Grid
      columns={columns}
      rows={rows}
      dataLoading={false}
      showSearch
      createGetCellContent={(displayedRows) =>
        ([, index]): DataGridModule.TextCell => ({
          kind: GridCellKind.Text,
          data: displayedRows[index]?.title ?? "",
          displayData: displayedRows[index]?.title ?? "",
          allowOverlay: false,
        })}
      {...searchProps}
    />
  </ThemeProvider>
);

describe("grid search ownership", () => {
  afterEach(cleanup);

  it("updates result highlights when the parent supplies a search query", () => {
    const { rerender } = render(grid({ searchValue: "meters" }));
    expect(editor.props?.searchResults).toEqual([[0, 1]]);
    rerender(grid({ searchValue: "number" }));
    expect(editor.props?.searchResults).toEqual([[0, 0]]);
    rerender(grid({ searchValue: "" }));
    expect(editor.props?.searchResults).toEqual([]);
  });

  it("notifies the parent when the query changes or search closes", () => {
    const onSearchValueChange = vi.fn();
    const onSearchClose = vi.fn();
    render(grid({ searchValue: "meters", onSearchValueChange, onSearchClose }));
    act(() => editor.props?.onSearchValueChange?.("number"));
    expect(onSearchValueChange).toHaveBeenLastCalledWith("number");
    act(() => editor.props?.onSearchClose?.());
    expect(onSearchValueChange).toHaveBeenLastCalledWith("");
    expect(onSearchClose).toHaveBeenCalledOnce();
  });

  it("keeps managing search locally for grids without a controlled query", () => {
    render(grid());
    act(() => editor.props?.onSearchValueChange?.("meters"));
    expect(editor.props?.searchValue).toBe("meters");
    expect(editor.props?.searchResults).toEqual([[0, 1]]);
    act(() => editor.props?.onSearchClose?.());
    expect(editor.props?.searchValue).toBe("");
    expect(editor.props?.searchResults).toEqual([]);
  });
});

describe("tree cell selection", () => {
  afterEach(cleanup);

  it("keeps the active cell on the same type when a branch above it changes", () => {
    const { rerender } = render(grid({ preserveCurrentCell: true }));
    const selection: DataGridModule.GridSelection = {
      rows: CompactSelection.empty(),
      columns: CompactSelection.empty(),
      current: {
        cell: [0, 1],
        range: { x: 0, y: 1, width: 1, height: 1 },
        rangeStack: [],
      },
    };
    act(() => editor.props?.onGridSelectionChange?.(selection));
    const expanded = [rows[0]!, { rowId: "length", title: "Length" }, rows[1]!];
    rerender(grid({ rows: expanded, preserveCurrentCell: true }));
    expect(editor.props?.gridSelection?.current?.cell).toEqual([0, 2]);
    rerender(grid({ rows: [rows[0]!], preserveCurrentCell: true }));
    expect(editor.props?.gridSelection?.current).toBeUndefined();
    rerender(grid({ preserveCurrentCell: true }));
    expect(editor.props?.gridSelection?.current?.cell).toEqual([0, 1]);
  });

  it("cancels pointer selection only over an expandable row's chevron", () => {
    const preventDefault = vi.fn();
    const args: Parameters<
      NonNullable<typeof renderDataTypeTreeCell.onSelect>
    >[0] = {
      cell: {
        kind: GridCellKind.Custom,
        allowOverlay: false,
        copyData: "Meters",
        data: {
          kind: "data-type-tree-cell",
          hierarchical: true,
          leftPadding: 4,
          showLabelExample: vi.fn(),
          title: "Meters",
          depth: 2,
          continuationDepths: [],
          hasNextSibling: false,
          expanded: false,
          hasChildren: true,
          muted: false,
          onToggle: vi.fn(),
          onOpen: vi.fn(),
        },
      },
      posX: 70,
      posY: 20,
      bounds: { x: 0, y: 0, width: 300, height: 42 },
      theme: {
        ...getDefaultTheme(),
        headerFontFull: "14px sans-serif",
        baseFontFull: "14px sans-serif",
        markerFontFull: "14px sans-serif",
      },
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      isTouch: false,
      isEdge: false,
      button: 0,
      buttons: 1,
      scrollEdge: [0, 0],
      preventDefault,
    };
    renderDataTypeTreeCell.onSelect?.(args);
    expect(preventDefault).toHaveBeenCalledOnce();
    preventDefault.mockClear();
    renderDataTypeTreeCell.onSelect?.({ ...args, posX: 100 });
    renderDataTypeTreeCell.onSelect?.({ ...args, posX: 45 });
    renderDataTypeTreeCell.onSelect?.({
      ...args,
      cell: { ...args.cell, data: { ...args.cell.data, hasChildren: false } },
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});

describe("Glide clipboard output", () => {
  it("copies labels as literal text while preserving spaces in HTML", async () => {
    const require = createRequire(import.meta.url);
    const dist = path.dirname(
      path.dirname(require.resolve("@glideapps/glide-data-grid")),
    );
    const { getCopyBufferContents } = (await import(
      pathToFileURL(path.join(dist, "esm/data-editor/copy-paste.js")).href
    )) as {
      getCopyBufferContents: (
        cells: readonly (readonly DataGridModule.GridCell[])[],
        columns: readonly number[],
      ) => { textPlain: string; textHtml: string };
    };
    const label =
      "Length value <a href=https://example.invalid>m</a>  <img src=x onerror=alert(1)> &amp; 'units'";
    const { textPlain, textHtml } = getCopyBufferContents(
      [
        [
          {
            kind: GridCellKind.Custom,
            allowOverlay: false,
            copyData: label,
            data: { kind: "data-type-tree-cell" },
          },
        ],
      ],
      [0],
    );
    expect(textPlain).toBe(label);
    const document = new DOMParser().parseFromString(textHtml, "text/html");
    const cell = document.querySelector("td");
    expect(cell?.querySelectorAll("a, img")).toHaveLength(0);
    expect(cell?.textContent).toBe(label);
    expect(cell?.getAttribute("gdg-raw-value")).toBe(label);
    expect(cell?.querySelectorAll("span")).toHaveLength(2);
  });
});
