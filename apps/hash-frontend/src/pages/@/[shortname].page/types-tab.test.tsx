// @vitest-environment jsdom
import { Box, ThemeProvider } from "@mui/material";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@hashintel/design-system/theme";

import { TypesTab } from "./types-tab";

import type { TypesTableRow } from "../../shared/types-table";
import type { TypesFilterRibbon } from "../../shared/types-table/filter-ribbon";
import type { ComponentProps, ReactNode } from "react";

const state = vi.hoisted(() => {
  const query: Record<string, string | string[]> = {
    shortname: "alice",
    tab: "Types",
  };
  return {
    query,
    rows: [] as TypesTableRow[],
    ribbon: undefined as ComponentProps<typeof TypesFilterRibbon> | undefined,
  };
});

vi.mock("next/router", () => ({ useRouter: () => ({ query: state.query }) }));
vi.mock("../../../components/grid/grid", () => ({
  Grid: ({ rows }: { rows: TypesTableRow[] }) => {
    state.rows = rows;
    return null;
  },
  gridHeaderHeightWithBorder: 40,
  gridHorizontalScrollbarHeight: 16,
}));
vi.mock("../../shared/types-table/filter-ribbon", () => ({
  TypesFilterRibbon: (props: ComponentProps<typeof TypesFilterRibbon>) => {
    state.ribbon = props;
    return null;
  },
}));
vi.mock("../../../components/hooks/use-users", () => ({
  useUsers: () => ({ users: [] }),
}));
vi.mock("../../../components/hooks/use-orgs", () => ({
  useOrgs: () => ({ orgs: [] }),
}));
vi.mock(
  "../../../shared/entity-types-context/hooks/use-entity-types-context-required",
  () => ({
    useEntityTypesContextRequired: () => ({
      entityTypes: [],
      isSpecialEntityTypeLookup: {
        "https://hash.ai/@alice/types/entity-type/link/v/1": { isLink: true },
      },
    }),
  }),
);
vi.mock("../../../shared/use-actors", () => ({
  useActors: () => ({ actors: [] }),
  isAiMachineActor: () => false,
}));
vi.mock("../../shared/data-types-context", () => ({
  useDataTypesContext: () => ({ dataTypes: {} }),
}));
vi.mock("../../shared/slide-stack", () => ({
  useSlideStack: () => ({ pushToSlideStack: vi.fn() }),
}));
vi.mock("../../shared/filter-bar", () => ({
  useInternalWebs: () => [],
  VisualizerHeader: ({ bottomLeft }: { bottomLeft: ReactNode }) => (
    <Box>{bottomLeft}</Box>
  ),
  SearchPill: () => null,
  WebFilterPill: () => null,
  visualizerHeaderHeight: 80,
}));
vi.mock("../../../shared/table-header/bulk-actions-dropdown", () => ({
  BulkActionsDropdown: () => null,
}));
vi.mock("../../../shared/table-header/export-to-csv-button", () => ({
  ExportToCsvButton: () => null,
}));
vi.mock("../../../shared/layout/layout-with-header/page-header", () => ({
  HEADER_HEIGHT: 60,
}));
vi.mock("../../shared/top-context-bar", () => ({
  TOP_CONTEXT_BAR_HEIGHT: 40,
}));
vi.mock("../../shared/type-graph-visualizer", () => ({
  TypeGraphVisualizer: () => null,
}));

type ProfileType = ComponentProps<typeof TypesTab>["types"][number];
const makeType = (title: string, kind: ProfileType["schema"]["kind"]) =>
  ({
    schema: {
      $id: `https://hash.ai/@alice/types/${kind === "entityType" ? "entity-type" : kind === "propertyType" ? "property-type" : "data-type"}/${title}/v/1`,
      kind,
      title,
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
  }) as ProfileType;

const types = [
  makeType("data", "dataType"),
  makeType("entity", "entityType"),
  makeType("property", "propertyType"),
  makeType("link", "entityType"),
];
const tab = (loading = false) => (
  <ThemeProvider theme={theme}>
    <TypesTab loading={loading} types={types} />
  </ThemeProvider>
);
const displayedTitles = () => state.rows.map(({ title }) => title);
const clearFilters = () => {
  expect(state.ribbon).toBeDefined();
  act(() => state.ribbon?.setFilters(() => []));
};

describe("profile type kind links", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    state.query = { shortname: "alice", tab: "Types" };
    state.rows = [];
    state.ribbon = undefined;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ["data-type", "data"],
    ["entity-type", "entity"],
    ["property-type", "property"],
    ["link-type", "link"],
  ])(
    "preselects an editable %s filter and filters the profile's rows",
    (kind, title) => {
      state.query.typeKind = kind;
      const { rerender } = render(tab());
      expect(displayedTitles()).toEqual([title]);
      expect(state.ribbon?.kind).toBe("all");
      expect(state.ribbon?.filters).toEqual([
        expect.objectContaining({
          field: "kind",
          operator: "anyOf",
          values: [kind],
        }),
      ]);

      clearFilters();
      rerender(tab(true));
      expect(displayedTitles()).toEqual(["data", "entity", "link", "property"]);
      expect(state.ribbon?.filters).toEqual([]);
    },
  );

  it("applies the URL kind when navigating between kinds, the unfiltered page, and profiles", () => {
    state.query.typeKind = "data-type";
    const { rerender } = render(tab());
    expect(displayedTitles()).toEqual(["data"]);

    state.query.typeKind = "link-type";
    rerender(tab());
    expect(displayedTitles()).toEqual(["link"]);

    delete state.query.typeKind;
    rerender(tab());
    expect(displayedTitles()).toEqual(["data", "entity", "link", "property"]);

    state.query.typeKind = "data-type";
    rerender(tab());
    clearFilters();
    state.query.shortname = "other-org";
    rerender(tab());
    expect(displayedTitles()).toEqual(["data"]);
  });
});
