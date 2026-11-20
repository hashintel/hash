// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";

import { DataTypesContext } from "../shared/data-types-context";
import { DataTypesLoadError } from "../shared/data-types-load-error";
import { TypesTable } from "../shared/types-table";
import TypesPage from "./[[...type-kind]].page";
import { DataTypeDrawer } from "./data-type-drawer";

import type { DataTypesContextValue } from "../shared/data-types-context";
import type { DataTypeWithMetadata } from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

vi.mock("@mui/material", () => {
  const Wrapper = ({ children }: PropsWithChildren) => children;
  return {
    Box: Wrapper,
    Container: Wrapper,
    Stack: Wrapper,
    Typography: Wrapper,
  };
});
vi.mock("next-seo", () => ({ NextSeo: () => null }));
vi.mock("next/router", () => ({
  useRouter: () => ({ isReady: false, query: {}, replace: vi.fn() }),
}));
vi.mock("./data-type-drawer", () => ({
  DataTypeDrawer: vi.fn(() => null),
}));
vi.mock("@blockprotocol/graph/stdlib", () => ({
  getEntityTypes: () => [],
  getRoots: () => [],
}));
vi.mock(
  "../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types",
  () => {
    const queryEntityTypes = vi.fn().mockResolvedValue({ data: {} });
    return { useBlockProtocolQueryEntityTypes: () => ({ queryEntityTypes }) };
  },
);
vi.mock(
  "../../shared/entity-types-context/shared/is-special-entity-type",
  () => ({ isSpecialEntityType: () => ({ isLink: false }) }),
);
vi.mock("../../shared/icons/files-light-icon", () => ({
  FilesLightIcon: () => null,
}));
vi.mock("../../shared/icons/plus-regular", () => ({
  PlusRegularIcon: () => null,
}));
vi.mock("../../shared/layout", () => ({ getLayoutWithSidebar: () => null }));
vi.mock("../../shared/property-types-context", () => ({
  usePropertyTypes: () => ({ propertyTypes: {} }),
}));
vi.mock("../shared/create-button", () => ({
  CreateButton: ({
    children,
    onClick,
  }: PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("../shared/top-context-bar", () => ({ TopContextBar: () => null }));
vi.mock("./[[...type-kind]].page/types-page-tabs", () => ({
  TypesPageTabs: () => null,
}));
vi.mock("../shared/data-types-load-error", () => ({
  DataTypesLoadError: vi.fn(() => null),
}));
vi.mock("../shared/types-table", () => ({
  TypesTable: vi.fn(() => null),
}));

const dataType = (slug: string, title: string, version = 1) =>
  ({
    schema: {
      $id: `https://hash.ai/@h/types/data-type/${slug}/v/${version}`,
      title,
    },
    metadata: {
      recordId: {
        baseUrl: `https://hash.ai/@h/types/data-type/${slug}/`,
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as unknown as DataTypeWithMetadata;

describe("data types in the Types listing", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(["data-type", "all"] as const)(
    "passes every latest data type to the table in the %s tab",
    async (currentTab) => {
      const latest = [
        dataType("meters", "Meters", 2),
        ...Array.from({ length: 999 }, (_, index) =>
          dataType(`fixture-${index}`, `Fixture ${index}`),
        ),
        dataType("final", "Final type"),
      ];
      const loadingContext: DataTypesContextValue = {
        dataTypes: null,
        latestDataTypes: null,
        loading: true,
        error: null,
        ensureFetched: vi.fn(),
        refetch: vi.fn().mockResolvedValue(undefined),
        onDataTypeSaved: vi.fn(),
      };
      const { rerender } = render(
        <DataTypesContext.Provider value={loadingContext}>
          <TypesPage currentTab={currentTab} />
        </DataTypesContext.Provider>,
      );
      expect(vi.mocked(TypesTable).mock.lastCall?.[0].types).toBeUndefined();

      vi.mocked(TypesTable).mockClear();
      rerender(
        <DataTypesContext.Provider
          value={{
            ...loadingContext,
            loading: false,
            error: new Error("Catalogue unavailable"),
          }}
        >
          <TypesPage currentTab={currentTab} />
        </DataTypesContext.Provider>,
      );
      expect(DataTypesLoadError).toHaveBeenCalled();
      expect(TypesTable).not.toHaveBeenCalled();

      rerender(
        <DataTypesContext.Provider
          value={{
            ...loadingContext,
            dataTypes: {},
            latestDataTypes: {},
            loading: false,
          }}
        >
          <TypesPage currentTab={currentTab} />
        </DataTypesContext.Provider>,
      );
      await waitFor(() =>
        expect(vi.mocked(TypesTable).mock.lastCall?.[0].types).toEqual([]),
      );

      const loadedContext: DataTypesContextValue = {
        ...loadingContext,
        dataTypes: Object.fromEntries(
          [...latest, dataType("meters", "Meters")].map((type) => [
            type.schema.$id,
            type,
          ]),
        ),
        latestDataTypes: Object.fromEntries(
          latest.map((type) => [type.metadata.recordId.baseUrl, type]),
        ),
        loading: false,
        error: null,
      };
      rerender(
        <DataTypesContext.Provider value={loadedContext}>
          <TypesPage currentTab={currentTab} />
        </DataTypesContext.Provider>,
      );

      await waitFor(() =>
        expect(vi.mocked(TypesTable).mock.lastCall?.[0].types).toEqual(latest),
      );
    },
  );

  it("offers version switching on a data type created from the drawer", () => {
    const versionOne = dataType("repro", "Repro");
    const versionTwo = dataType("repro", "Repro", 2);

    /** Editions in ascending order, so the last one is the latest */
    const contextWith = (
      editions: DataTypeWithMetadata[],
    ): DataTypesContextValue => ({
      dataTypes: Object.fromEntries(
        editions.map((type) => [type.schema.$id, type]),
      ),
      latestDataTypes: Object.fromEntries(
        editions.map((type) => [type.metadata.recordId.baseUrl, type]),
      ),
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
      onDataTypeSaved: vi.fn(),
    });

    const { rerender, getByText } = render(
      <DataTypesContext.Provider value={contextWith([versionOne])}>
        <TypesPage currentTab="data-type" />
      </DataTypesContext.Provider>,
    );

    fireEvent.click(getByText("Create data type"));

    const createProps = vi.mocked(DataTypeDrawer).mock.lastCall?.[0];
    if (createProps?.mode !== "create") {
      throw new Error("Expected the create drawer to open");
    }
    act(() => createProps.onCreated(versionOne));

    const editProps = () => {
      const props = vi.mocked(DataTypeDrawer).mock.lastCall?.[0];
      if (props?.mode !== "edit") {
        throw new Error("Expected the edit drawer to be open");
      }
      return props;
    };

    expect(editProps().dataType).toBe(versionOne);
    expect(editProps().readonly).toBe(false);
    expect(editProps().onSwitchVersion).toBeDefined();

    // Saving hands back the new latest edition and refreshes the catalogue
    act(() => editProps().onUpdated(versionTwo));
    rerender(
      <DataTypesContext.Provider value={contextWith([versionOne, versionTwo])}>
        <TypesPage currentTab="data-type" />
      </DataTypesContext.Provider>,
    );
    expect(editProps().dataType).toBe(versionTwo);
    expect(editProps().readonly).toBe(false);

    // An older edition opens as a read-only record
    act(() => editProps().onSwitchVersion?.(versionOne));
    expect(editProps().dataType).toBe(versionOne);
    expect(editProps().readonly).toBe(true);

    act(() => editProps().onSwitchVersion?.(versionTwo));
    expect(editProps().dataType).toBe(versionTwo);
    expect(editProps().readonly).toBe(false);
  });
});
