// @vitest-environment jsdom
import { ApolloLink, Observable } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing";
import { Box } from "@mui/material";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { useDataTypesContext } from "../pages/shared/data-types-context";
import { DataTypesContextProvider } from "../pages/shared/data-types-context-provider";
import { usePropertyTypes } from "./property-types-context";
import { PropertyTypesContextProvider } from "./property-types-context-provider";

import type { Operation } from "@apollo/client";

const DataCatalogue = () => {
  const { dataTypes, loading } = useDataTypesContext();
  return (
    <Box role="status">
      {loading || dataTypes === null
        ? "Loading catalogue"
        : `${Object.keys(dataTypes).length} types`}
    </Box>
  );
};

const PropertyCatalogue = () => {
  const { propertyTypes } = usePropertyTypes();
  return (
    <Box role="status">
      {propertyTypes === null
        ? "Loading catalogue"
        : `${Object.keys(propertyTypes).length} types`}
    </Box>
  );
};

afterEach(cleanup);

it.each([
  ["data types", DataTypesContextProvider, DataCatalogue],
  ["property types", PropertyTypesContextProvider, PropertyCatalogue],
] as const)(
  "loads %s only when needed and shares them across consumers",
  async (_, Provider, Catalogue) => {
    const operations: Operation[] = [];
    let completeQuery: (() => void) | undefined;
    const link = new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          operations.push(operation);
          completeQuery = () => {
            const subgraph = {
              roots: [],
              vertices: {},
              edges: {},
              temporalAxes: {
                initial: fullTransactionTimeAxis,
                resolved: {
                  pinned: {
                    axis: "decisionTime",
                    timestamp: "2026-01-01T00:00:00.000Z",
                  },
                  variable: {
                    axis: "transactionTime",
                    interval: {
                      start: { kind: "unbounded" },
                      end: {
                        kind: "inclusive",
                        limit: "2026-01-01T00:00:00.000Z",
                      },
                    },
                  },
                },
              },
            };
            const responses: Record<string, unknown> = {
              queryDataTypeSubgraph: { subgraph },
              queryPropertyTypeSubgraph: { subgraph },
              queryDataTypes: { dataTypes: [] },
              queryPropertyTypes: { propertyTypes: [] },
            };
            const response = responses[operation.operationName];
            expect(response).toBeDefined();
            observer.next({ data: { [operation.operationName]: response } });
            observer.complete();
          };
        }),
    );

    const App = ({ showCatalogue }: { showCatalogue: boolean }) => (
      <MockedProvider link={link}>
        <Provider>
          {showCatalogue ? (
            <>
              <Catalogue />
              <Catalogue />
            </>
          ) : (
            <Box>Account settings</Box>
          )}
        </Provider>
      </MockedProvider>
    );

    const { rerender } = render(<App showCatalogue={false} />);
    await act(async () => {});
    expect(operations).toHaveLength(0);

    rerender(<App showCatalogue />);
    await waitFor(() => expect(operations).toHaveLength(1));
    expect(screen.getAllByText("Loading catalogue")).toHaveLength(2);

    act(() => completeQuery?.());
    await waitFor(() => expect(screen.getAllByText("0 types")).toHaveLength(2));

    rerender(<App showCatalogue={false} />);
    rerender(<App showCatalogue />);
    expect(screen.getAllByText("0 types")).toHaveLength(2);
    expect(operations).toHaveLength(1);
  },
);
