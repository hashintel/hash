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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { TypesTable } from "./types-table";

import type { Grid } from "../../components/grid/grid";
import type { ExportToCsvButton } from "../../shared/table-header/export-to-csv-button";
import type { TypesTableRow } from "./types-table";
import type {
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
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
}));
vi.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
vi.mock("../../components/grid/grid", () => ({
  Grid: (props: GridProps) => {
    state.grid = props;
    const rowsRef = props.currentlyDisplayedRowsRef;
    if (rowsRef) {
      rowsRef.current = props.rows ?? [];
    }
    return null;
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
  useDataTypesContext: () => ({ dataTypes: {} }),
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
const renderTable = () =>
  render(
    <ThemeProvider theme={theme}>
      <TypesTable kind="data-type" onlyOneWeb types={types} />
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
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
});
