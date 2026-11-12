// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { queryDataTypesQuery } from "../../graphql/queries/ontology/data-type.queries";
import { useDataTypesContext } from "./data-types-context";
import { DataTypesContextProvider } from "./data-types-context-provider";

import type { DataTypeWithMetadata } from "@blockprotocol/type-system";

const meters = (version: number) =>
  ({
    schema: {
      $id: `https://hash.ai/@h/types/data-type/meters/v/${version}`,
      title: "Meters",
    },
    metadata: {
      recordId: {
        baseUrl: "https://hash.ai/@h/types/data-type/meters/",
        version: makeOntologyTypeVersion({ major: version }),
      },
    },
  }) as unknown as DataTypeWithMetadata;
const request = {
  filter: { all: [] },
  temporalAxes: fullTransactionTimeAxis,
  limit: 1000,
};
const Catalogue = () => {
  const { dataTypes, latestDataTypes, loading } = useDataTypesContext();
  return (
    <div>
      {loading
        ? "Loading catalogue"
        : `${Object.keys(dataTypes ?? {}).length} versions; latest ${Object.values(
            latestDataTypes ?? {},
          )
            .map(({ schema }) => schema.$id)
            .join(",")}`}
    </div>
  );
};

describe("data type catalogue pagination", () => {
  afterEach(cleanup);

  it("loads later pages before exposing the catalogue and retains all versions", async () => {
    const old = meters(1);
    const latest = meters(2);
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: queryDataTypesQuery, variables: { request } },
            result: {
              data: {
                queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
              },
            },
          },
          {
            request: {
              query: queryDataTypesQuery,
              variables: { request: { ...request, after: old.schema.$id } },
            },
            delay: 20,
            result: { data: { queryDataTypes: { dataTypes: [latest] } } },
          },
        ]}
      >
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    expect(screen.getByText("Loading catalogue")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText(`2 versions; latest ${latest.schema.$id}`),
      ).toBeTruthy(),
    );
  });

  it("completes when the catalogue fits on one page", async () => {
    const latest = meters(2);
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: queryDataTypesQuery, variables: { request } },
            result: { data: { queryDataTypes: { dataTypes: [latest] } } },
          },
        ]}
      >
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(`1 versions; latest ${latest.schema.$id}`),
      ).toBeTruthy(),
    );
  });
});
