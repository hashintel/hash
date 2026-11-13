// @vitest-environment jsdom
import { GridCellKind } from "@glideapps/glide-data-grid";
import { ThemeProvider } from "@mui/material";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

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
  > = {},
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
