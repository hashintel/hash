// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { DataTypesContextProvider } from "../shared/data-types-context-provider";
import TypesPage from "./[[...type-kind]].page";

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
vi.mock("../shared/create-button", () => ({ CreateButton: () => null }));
vi.mock("../shared/top-context-bar", () => ({ TopContextBar: () => null }));
vi.mock("./[[...type-kind]].page/types-page-tabs", () => ({
  TypesPageTabs: () => null,
}));
vi.mock("../shared/types-table", () => ({
  TypesTable: ({ types }: { types?: DataTypeWithMetadata[] }) => (
    <div>
      {types
        ? `${types.length} types; meters ${types.find(({ schema }) => schema.title === "Meters")?.metadata.recordId.version}; final ${types.some(({ schema }) => schema.title === "Final page type")}`
        : "Loading types"}
    </div>
  ),
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

const request = {
  filter: { all: [] },
  temporalAxes: fullTransactionTimeAxis,
  limit: 1000,
};

describe("data types in the Types listing", () => {
  afterEach(cleanup);

  it.each(["data-type", "all"] as const)(
    "lists more than 1,000 types without duplicate versions in the %s tab",
    async (currentTab) => {
      const firstPage = [
        dataType("meters", "Meters"),
        ...Array.from({ length: 999 }, (_, index) =>
          dataType(`fixture-${index}`, `Fixture ${index}`),
        ),
      ];
      const cursor = firstPage.at(-1)?.schema.$id;
      render(
        <MockedProvider
          mocks={[
            {
              request: { query: queryDataTypesQuery, variables: { request } },
              result: {
                data: { queryDataTypes: { dataTypes: firstPage, cursor } },
              },
            },
            {
              request: {
                query: queryDataTypesQuery,
                variables: { request: { ...request, after: cursor } },
              },
              result: {
                data: {
                  queryDataTypes: {
                    dataTypes: [
                      dataType("meters", "Meters", 2),
                      dataType("final", "Final page type"),
                    ],
                  },
                },
              },
            },
          ]}
        >
          <DataTypesContextProvider>
            <TypesPage currentTab={currentTab} />
          </DataTypesContextProvider>
        </MockedProvider>,
      );

      expect(screen.getByText("Loading types")).toBeTruthy();
      await waitFor(() =>
        expect(
          screen.getByText("1001 types; meters 2; final true"),
        ).toBeTruthy(),
      );
    },
  );
});
