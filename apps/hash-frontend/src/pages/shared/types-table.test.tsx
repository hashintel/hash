// @vitest-environment jsdom
import { GridCellKind } from "@glideapps/glide-data-grid";
import { Box, ThemeProvider } from "@mui/material";
import {
  act,
  cleanup,
  render,
  fireEvent,
  screen,
} from "@testing-library/react";
import { useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";
import { gridRowHeight } from "@local/hash-isomorphic-utils/data-grid";

import { TypesTable } from "./types-table";

import type { Grid } from "../../components/grid/grid";
import type { ExportToCsvButton } from "../../shared/table-header/export-to-csv-button";
import type { TypesTableRow } from "./types-table";
import type { DataTypeTreeCell } from "./types-table/data-type-tree-cell";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  DataEditorRef,
  SizedGridColumn,
} from "@glideapps/glide-data-grid";
import type { ComponentProps, ReactNode } from "react";

type GridProps = ComponentProps<
  typeof Grid<TypesTableRow, SizedGridColumn, string>
>;
const state = vi.hoisted(() => ({
  grid: undefined as GridProps | undefined,
  exportCsv: undefined as
    | ComponentProps<typeof ExportToCsvButton>["generateCsvFile"]
    | undefined,
  selected: [] as DataTypeWithMetadata[],
  dataTypes: {} as Record<VersionedUrl, DataTypeWithMetadata>,
  getBounds: vi.fn((column: number, row = 0) => ({
    x: column === 0 ? 340 : 820,
    y: 420 + row * 42,
    width: 480,
    height: 42,
  })),
}));
vi.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
vi.mock("../../components/grid/grid", () => ({
  Grid: (props: GridProps) => {
    useImperativeHandle(
      props.gridRef,
      () => ({ getBounds: state.getBounds }) as unknown as DataEditorRef,
    );
    state.grid = props;
    const rowsRef = props.currentlyDisplayedRowsRef;
    if (rowsRef) {
      rowsRef.current = props.rows ?? [];
    }
    return props.rows?.length ? null : props.noResultsContent;
  },
  gridHeaderHeightWithBorder: 40,
  gridHorizontalScrollbarHeight: 16,
}));
vi.mock("./types-table/filter-ribbon", () => ({
  TypesFilterRibbon: ({ leadingControls }: { leadingControls: ReactNode }) => (
    <Box>{leadingControls}</Box>
  ),
}));
vi.mock("../../components/hooks/use-users", () => ({
  useUsers: () => ({ users: [] }),
}));
vi.mock("../../components/hooks/use-orgs", () => ({
  useOrgs: () => ({ orgs: [] }),
}));
vi.mock(
  "../../shared/entity-types-context/hooks/use-entity-types-context-required",
  () => ({
    useEntityTypesContextRequired: () => ({
      entityTypes: [],
      isSpecialEntityTypeLookup: {},
    }),
  }),
);
vi.mock("../../shared/use-actors", () => ({
  useActors: () => ({ actors: [] }),
  isAiMachineActor: () => false,
}));
vi.mock("./data-types-context", () => ({
  useDataTypesContext: () => ({ dataTypes: state.dataTypes }),
}));
vi.mock("./slide-stack", () => ({
  useSlideStack: () => ({ pushToSlideStack: vi.fn() }),
}));
vi.mock("./filter-bar", () => ({
  useInternalWebs: () => [],
  VisualizerHeader: ({
    topRight,
    bottomLeft,
  }: {
    topRight: ReactNode;
    bottomLeft: ReactNode;
  }) => (
    <Box>
      {topRight}
      {bottomLeft}
    </Box>
  ),
  SearchPill: ({ onClick }: { onClick: () => void }) => (
    <Box component="button" onClick={onClick}>
      Search
    </Box>
  ),
  WebFilterPill: () => null,
  visualizerHeaderHeight: 80,
}));
vi.mock("../../shared/table-header/bulk-actions-dropdown", () => ({
  BulkActionsDropdown: ({
    selectedItems,
  }: {
    selectedItems: DataTypeWithMetadata[];
  }) => {
    state.selected = selectedItems;
    return <Box data-testid="selected-count">{selectedItems.length}</Box>;
  },
}));
vi.mock("../../shared/table-header/export-to-csv-button", () => ({
  ExportToCsvButton: ({
    generateCsvFile,
  }: ComponentProps<typeof ExportToCsvButton>) => {
    state.exportCsv = generateCsvFile;
    return null;
  },
}));
vi.mock("../../shared/layout/layout-with-header/page-header", () => ({
  HEADER_HEIGHT: 60,
}));
vi.mock("./top-context-bar", () => ({ TOP_CONTEXT_BAR_HEIGHT: 40 }));
vi.mock("./type-graph-visualizer", () => ({ TypeGraphVisualizer: () => null }));

const id = (title: string): VersionedUrl =>
  `https://blockprotocol.org/@blockprotocol/types/data-type/${title}/v/1`;
const dataType = (
  title: string,
  parents: string[] = [],
): DataTypeWithMetadata =>
  ({
    schema: {
      $id: id(title),
      kind: "dataType",
      type: "number",
      title,
      allOf: parents.map((parent) => ({ $ref: id(parent) })),
    },
    metadata: {
      webId: "profile-web",
      provenance: { edition: { createdById: "alice" } },
      temporalVersioning: {
        transactionTime: {
          start: { kind: "inclusive", limit: "2026-01-01T00:00:00.000Z" },
          end: { kind: "unbounded" },
        },
      },
    },
  }) as DataTypeWithMetadata;
const types = [
  dataType("value"),
  dataType("number", ["value"]),
  dataType("length", ["number"]),
  dataType("distance", ["number"]),
  dataType("meters", ["length", "distance"]),
];
const visibleRows = () => state.grid?.rows ?? [];
const toggle = (title: string) => {
  const rows = visibleRows();
  const index = rows.findIndex((row) => row.title === title);
  expect(index).toBeGreaterThanOrEqual(0);
  const cell = state.grid!.createGetCellContent(rows)([0, index]);
  if (cell.kind !== GridCellKind.Custom || !("onToggle" in cell.data)) {
    throw new Error("Expected a tree cell");
  }
  const onToggle = cell.data.onToggle as () => void;
  act(onToggle);
};
const csvTitles = () => {
  expect(state.exportCsv).toBeDefined();
  const csv = state.exportCsv!();
  return csv?.content.slice(1).map((row) => row[0]);
};
const renderTable = (tableTypes = types) =>
  render(
    <ThemeProvider theme={theme}>
      <TypesTable kind="data-type" onlyOneWeb types={tableTypes} />
    </ThemeProvider>,
  );

describe("hierarchical type table", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    state.grid = undefined;
    state.exportCsv = undefined;
    state.selected = [];
    state.dataTypes = {};
    state.getBounds.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(["Nested List", "Flat List"])(
    "keeps the %s label tooltip anchored to the data column while the pointer moves",
    (mode) => {
      const meters = dataType("meters");
      meters.schema.label = { right: "m" };
      state.dataTypes = { [meters.schema.$id]: meters };
      renderTable([meters]);
      fireEvent.click(screen.getByRole("button", { name: mode }));
      expect(state.grid?.enableCheckboxSelection).toBe(true);
      const cell = state.grid!.createGetCellContent(visibleRows())([
        0, 0,
      ]) as DataTypeTreeCell;
      act(() =>
        cell.data.showLabelExample({
          horizontalAlign: "left",
          interactablePosRelativeToCell: { right: 12, top: 0 },
          interactableSize: { width: 80, height: 42 },
        }),
      );
      expect(state.getBounds).toHaveBeenLastCalledWith(0, 0);
      expect(screen.getByRole("tooltip").textContent).toBe("Example value42 m");
      fireEvent.mouseMove(document, { clientX: 760, clientY: 440 });
      fireEvent.mouseMove(document, { clientX: 765, clientY: 435 });
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.mouseMove(screen.getByText("Example value"), {
        clientX: 740,
        clientY: 410,
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.mouseMove(document, { clientX: 600, clientY: 440 });
      expect(screen.queryByRole("tooltip")).toBeNull();
    },
  );

  it("reserves room for the empty state, then sizes the table to visible tree rows", () => {
    render(
      <ThemeProvider theme={theme}>
        <TypesTable kind="data-type" allTypes={types} types={types} />
      </ThemeProvider>,
    );
    expect(screen.getByRole("heading", { name: "No types yet" })).toBeTruthy();
    expect(state.grid?.height).toContain(`(5 * ${gridRowHeight}px)`);
    expect(
      screen
        .getByRole("link", { name: "Create an entity type" })
        .getAttribute("href"),
    ).toMatch(/\/new\/types\/entity-type$/);
    fireEvent.click(
      screen.getByRole("button", { name: "Show all public types" }),
    );
    expect(screen.queryByRole("heading", { name: "No types yet" })).toBeNull();
    expect(visibleRows().map(({ title }) => title)).toEqual(["number"]);
    expect(state.grid?.height).toContain(`(1 * ${gridRowHeight}px)`);
    toggle("number");
    expect(state.grid?.height).toContain(`(3 * ${gridRowHeight}px)`);
    toggle("distance");
    expect(state.grid?.height).toContain(`(4 * ${gridRowHeight}px)`);
    toggle("number");
    expect(state.grid?.height).toContain(`(1 * ${gridRowHeight}px)`);
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(state.grid?.height).toContain(`(5 * ${gridRowHeight}px)`);
  });

  it("reserves room for the filtered empty state when the full catalogue is unavailable", () => {
    render(
      <ThemeProvider theme={theme}>
        <TypesTable kind="data-type" allTypes={null} types={types} />
      </ThemeProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "No data types in your webs" }),
    ).toBeTruthy();
    expect(state.grid?.height).toContain(`(3 * ${gridRowHeight}px)`);
    expect(
      screen.queryByRole("link", { name: "Create an entity type" }),
    ).toBeNull();
  });

  it("exports all filtered types once regardless of expansion", () => {
    renderTable();
    expect(visibleRows().map(({ title }) => title)).toEqual(["number"]);
    const expected = ["distance", "length", "meters", "number", "value"];
    expect(csvTitles()).toEqual(expected);
    toggle("number");
    toggle("length");
    toggle("distance");
    expect(
      visibleRows().filter(({ title }) => title === "meters"),
    ).toHaveLength(2);
    expect(csvTitles()).toEqual(expected);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    act(() => state.grid?.onSearchValueChange?.("meters"));
    expect(csvTitles()).toEqual(["meters"]);
  });

  it("retains collapsed selections on checkbox edits and offers an explicit clear", () => {
    renderTable();
    toggle("number");
    toggle("distance");
    const meters = visibleRows().find(({ title }) => title === "meters")!;
    act(() => state.grid?.onSelectedRowsChange?.([meters]));
    toggle("distance");
    const length = visibleRows().find(({ title }) => title === "length")!;
    act(() => state.grid?.onSelectedRowsChange?.([length]));
    expect(state.selected.map(({ schema }) => schema.title).sort()).toEqual([
      "length",
      "meters",
    ]);
    act(() => state.grid?.onSelectedRowsChange?.([]));
    expect(state.selected.map(({ schema }) => schema.title)).toEqual([
      "meters",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(state.grid?.selectedRows).toEqual([]);
    expect(screen.queryByTestId("selected-count")).toBeNull();
  });

  it("switches layout without losing expanded branches, search, or bulk selections", () => {
    renderTable();
    expect(
      screen
        .getByRole("button", { name: "Nested List" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    toggle("number");
    toggle("distance");
    const meters = visibleRows().find(({ title }) => title === "meters")!;
    act(() => state.grid?.onSelectedRowsChange?.([meters]));
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual([
      "distance",
      "length",
      "meters",
      "number",
      "value",
    ]);
    expect(visibleRows().every(({ hierarchy }) => !hierarchy)).toBe(true);
    expect(state.grid?.selectedRows?.map(({ title }) => title)).toEqual([
      "meters",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Nested List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual([
      "number",
      "distance",
      "meters",
      "length",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    act(() => state.grid?.onSearchValueChange?.("meters"));
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual(["meters"]);
    expect(csvTitles()).toEqual(["meters"]);
    fireEvent.click(screen.getByRole("button", { name: "Nested List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual([
      "number",
      "distance",
      "meters",
      "length",
      "meters",
    ]);
  });

  it("selects a multiply inherited type once and allows either occurrence to clear it", () => {
    renderTable();
    toggle("number");
    toggle("distance");
    toggle("length");
    const occurrences = visibleRows().filter(({ title }) => title === "meters");
    act(() => state.grid?.onSelectedRowsChange?.([occurrences[0]!]));
    expect(state.selected).toHaveLength(1);
    expect(state.grid?.selectedRows).toHaveLength(2);
    act(() => state.grid?.onSelectedRowsChange?.([occurrences[1]!]));
    expect(state.grid?.selectedRows).toEqual([]);
  });

  it("offers nested, flat, and graph views in one switcher for Data Types", () => {
    const { rerender } = renderTable();
    const modes = screen.getByRole("group", { name: "view" });
    expect(
      Array.from(modes.querySelectorAll("button"), (button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(["Nested List", "Flat List", "Graph view"]);
    fireEvent.click(screen.getByRole("button", { name: "Graph view" }));
    expect(
      screen
        .getByRole("button", { name: "Graph view" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(visibleRows().every(({ hierarchy }) => !hierarchy)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Graph view" }));
    fireEvent.click(screen.getByRole("button", { name: "Nested List" }));
    expect(visibleRows().every(({ hierarchy }) => hierarchy)).toBe(true);
    rerender(
      <ThemeProvider theme={theme}>
        <TypesTable kind="all" onlyOneWeb types={types} />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: "Nested List" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Flat List" })).toBeNull();
    expect(screen.getByRole("button", { name: "Table view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Graph view" })).toBeTruthy();
  });

  it("finds a type when its copied title and label preview are pasted into search", () => {
    renderTable(
      types.map((type) =>
        type.schema.title === "meters"
          ? { ...type, schema: { ...type.schema, label: { right: "m" } } }
          : type,
      ),
    );
    toggle("number");
    toggle("distance");
    const rows = visibleRows();
    const index = rows.findIndex(({ title }) => title === "meters");
    const cell = state.grid!.createGetCellContent(rows)([0, index]);
    if (cell.kind !== GridCellKind.Custom) {
      throw new Error("Expected a tree cell");
    }
    expect(cell.copyData).toBe("meters x m");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    act(() => state.grid?.onSearchValueChange?.(cell.copyData));
    expect(
      visibleRows()
        .filter(({ hierarchy }) => hierarchy?.matchesSearch)
        .map(({ title }) => title),
    ).toEqual(["meters", "meters"]);
    expect(csvTitles()).toEqual(["meters"]);
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual(["meters"]);
    const flatCell = state.grid!.createGetCellContent(visibleRows())([0, 0]);
    expect(flatCell.copyData).toBe(cell.copyData);
    if (flatCell.kind !== GridCellKind.Custom) {
      throw new Error("Expected a label-preview cell");
    }
    expect(flatCell.data).toMatchObject({
      kind: "data-type-tree-cell",
      hierarchical: false,
      leftPadding: 4,
      labelPreview: visibleRows()[0]!.labelPreview,
      hasChildren: false,
    });
    expect(csvTitles()).toEqual(["meters"]);
    fireEvent.click(screen.getByRole("button", { name: "Nested List" }));
    expect(
      visibleRows()
        .filter(({ hierarchy }) => hierarchy?.matchesSearch)
        .map(({ title }) => title),
    ).toEqual(["meters", "meters"]);
  });

  it("uses the bounded inherited tuple preview for both clipboard and search", () => {
    const parent: DataTypeWithMetadata = {
      ...dataType("parent"),
      schema: {
        ...dataType("parent").schema,
        type: "array",
        items: { type: "number", label: { right: "m".repeat(4096) } },
      },
    };
    const tuple: DataTypeWithMetadata = {
      ...dataType("tuple", ["parent"]),
      schema: {
        ...dataType("tuple", ["parent"]).schema,
        type: "array",
        items: false,
        prefixItems: [
          { type: "number" },
          ...Array.from({ length: 2047 }, () => ({ type: "number" as const })),
        ],
      },
    };
    state.dataTypes = { [parent.schema.$id]: parent };
    renderTable([tuple]);
    const cell = state.grid!.createGetCellContent(visibleRows())([0, 0]);
    if (cell.kind !== GridCellKind.Custom) {
      throw new Error("Expected a tree cell");
    }
    expect(cell.copyData.length).toBeLessThanOrEqual("tuple ".length + 256);
    expect(cell.copyData).toContain("…");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    act(() => state.grid?.onSearchValueChange?.(cell.copyData));
    expect(
      visibleRows()
        .filter(({ hierarchy }) => hierarchy?.matchesSearch)
        .map(({ title }) => title),
    ).toEqual(["tuple"]);
    expect(csvTitles()).toEqual(["tuple"]);
    fireEvent.click(screen.getByRole("button", { name: "Flat List" }));
    expect(visibleRows().map(({ title }) => title)).toEqual(["tuple"]);
    expect(
      state.grid!.createGetCellContent(visibleRows())([0, 0]).copyData,
    ).toBe(cell.copyData);
  });
});
