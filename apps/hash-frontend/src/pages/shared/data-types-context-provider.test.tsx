// @vitest-environment jsdom
import { ApolloLink, Observable } from "@apollo/client";
import { MockedProvider } from "@apollo/client/testing";
import { Box } from "@mui/material";
import { captureException } from "@sentry/nextjs";
import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
} from "@testing-library/react";
import { SnackbarProvider } from "notistack";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";
import { fullTransactionTimeAxis } from "@local/hash-isomorphic-utils/graph-queries";

import { useDataTypesContext } from "./data-types-context";
import { DataTypesContextProvider } from "./data-types-context-provider";

import type { QueryDataTypesQuery } from "../../graphql/api-types.gen";
import type { Operation } from "@apollo/client";
import type { DataTypeWithMetadata } from "@blockprotocol/type-system";
import type { ReactElement, ReactNode } from "react";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("../../shared/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => (
    <Box component="button" onClick={onClick}>
      {children}
    </Box>
  ),
}));

const render = (element: ReactElement) =>
  renderComponent(element, { wrapper: SnackbarProvider });

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
  const [refreshResult, setRefreshResult] = useState("idle");
  const { dataTypes, latestDataTypes, loading, refetch, onDataTypeSaved } =
    useDataTypesContext();
  return (
    <Box>
      {loading ? <Box>Loading catalogue</Box> : null}
      <Box>
        {dataTypes && latestDataTypes
          ? `${Object.keys(dataTypes).length} versions; latest ${Object.values(
              latestDataTypes,
            )
              .map(({ schema }) => schema.$id)
              .join(",")}`
          : "No catalogue"}
      </Box>
      <Box data-testid="all-versions">
        {dataTypes === null ? "unavailable" : Object.keys(dataTypes).length}
      </Box>
      <Box data-testid="latest-versions">
        {latestDataTypes === null
          ? "unavailable"
          : Object.keys(latestDataTypes).length}
      </Box>
      <Box data-testid="refresh-result">{refreshResult}</Box>
      <Box
        component="button"
        type="button"
        onClick={() => {
          setRefreshResult("pending");
          void refetch().then((success) =>
            setRefreshResult(success ? "complete" : "failed"),
          );
        }}
      >
        Refresh catalogue
      </Box>
      {[2, 3, 4].map((version) => (
        <Box
          component="button"
          key={version}
          onClick={() => onDataTypeSaved(meters(version))}
        >
          Save version {version}
        </Box>
      ))}
    </Box>
  );
};

const createCatalogueLink = () => {
  const operations: Operation[] = [];
  const pending: ((result: QueryDataTypesQuery | Error) => void)[] = [];
  const responses: typeof pending = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((observer) => {
        operations.push(operation);
        const reply = (result: QueryDataTypesQuery | Error) => {
          if (result instanceof Error) {
            observer.error(result);
          } else {
            observer.next({ data: result });
            observer.complete();
          }
        };
        pending.push(reply);
        responses.push(reply);
      }),
  );
  const respond = async (result: QueryDataTypesQuery | Error) => {
    const next = pending.shift();
    if (!next) {
      throw new Error("No catalogue request is pending");
    }
    await act(() => Promise.resolve(next(result)));
  };
  const respondAt = async (
    index: number,
    result: QueryDataTypesQuery | Error,
  ) => {
    const reply = responses[index];
    if (!reply) {
      throw new Error(`No catalogue request at index ${index}`);
    }
    const pendingIndex = pending.indexOf(reply);
    if (pendingIndex >= 0) {
      pending.splice(pendingIndex, 1);
    }
    await act(() => Promise.resolve(reply(result)));
  };
  return { link, operations, respond, respondAt };
};

describe("data type catalogue pagination", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes both maps only after the last page and keeps the newest version regardless of order", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const latest = meters(10);
    const intermediate = meters(9);
    const oldest = meters(1);
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    expect(screen.getByText("Loading catalogue")).toBeTruthy();
    await respond({
      queryDataTypes: { dataTypes: [latest], cursor: latest.schema.$id },
    });
    await waitFor(() => expect(operations).toHaveLength(2));
    expect(operations.at(-1)?.variables).toEqual({
      request: { ...request, after: latest.schema.$id },
    });
    expect(screen.getByTestId("all-versions").textContent).toBe("unavailable");
    expect(screen.getByTestId("latest-versions").textContent).toBe(
      "unavailable",
    );
    expect(screen.getByText("Loading catalogue")).toBeTruthy();

    await respond({
      queryDataTypes: {
        dataTypes: [intermediate],
        cursor: intermediate.schema.$id,
      },
    });
    await waitFor(() => expect(operations).toHaveLength(3));
    expect(operations.at(-1)?.variables).toEqual({
      request: { ...request, after: intermediate.schema.$id },
    });
    expect(screen.getByTestId("all-versions").textContent).toBe("unavailable");
    expect(screen.getByTestId("latest-versions").textContent).toBe(
      "unavailable",
    );

    await respond({ queryDataTypes: { dataTypes: [oldest] } });
    await screen.findByText(`3 versions; latest ${latest.schema.$id}`);
    expect(screen.getByTestId("all-versions").textContent).toBe("3");
    expect(screen.getByTestId("latest-versions").textContent).toBe("1");
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("recovers when the initial request fails", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const latest = meters(2);
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Box>Unrelated page</Box>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond(new Error("Initial request failed"));
    await screen.findByText("Could not refresh data types. Try again.");
    expect(screen.getByText("Unrelated page")).toBeTruthy();
    expect(screen.queryByText("Loading catalogue")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(operations).toHaveLength(2));
    expect(operations.at(-1)?.variables).toEqual({ request });
    await respond({ queryDataTypes: { dataTypes: [latest] } });
    await screen.findByText(`1 versions; latest ${latest.schema.$id}`);
    await waitFor(() =>
      expect(
        screen.queryByText("Could not refresh data types. Try again."),
      ).toBeNull(),
    );
  });

  it("keeps the complete catalogue available until every refresh page arrives", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const old = meters(1);
    const previousLatest = meters(2);
    const refreshedLatest = meters(3);
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await respond({ queryDataTypes: { dataTypes: [previousLatest] } });
    await screen.findByText(`2 versions; latest ${previousLatest.schema.$id}`);

    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await waitFor(() => expect(operations).toHaveLength(4));
    expect(screen.getByText("Loading catalogue")).toBeTruthy();
    expect(
      screen.getByText(`2 versions; latest ${previousLatest.schema.$id}`),
    ).toBeTruthy();
    expect(screen.queryByText("No catalogue")).toBeNull();

    await respond({
      queryDataTypes: { dataTypes: [previousLatest, refreshedLatest] },
    });
    await screen.findByText(`3 versions; latest ${refreshedLatest.schema.$id}`);
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("keeps unrelated content mounted and retries a failed later page from the start", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const old = meters(1);
    const latest = meters(2);
    const failure = new Error("Temporary network failure");
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Box>Unrelated page</Box>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await respond(failure);
    await screen.findByText("Could not refresh data types. Try again.");
    expect(screen.getByText("Unrelated page")).toBeTruthy();
    expect(screen.getByText("No catalogue")).toBeTruthy();
    expect(screen.queryByText("Loading catalogue")).toBeNull();
    expect(operations).toHaveLength(2);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ networkError: failure }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(operations).toHaveLength(3));
    expect(operations.at(-1)?.variables).toEqual({ request });
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await waitFor(() => expect(operations).toHaveLength(4));
    await respond({ queryDataTypes: { dataTypes: [latest] } });
    await screen.findByText(`2 versions; latest ${latest.schema.$id}`);
    await waitFor(() =>
      expect(
        screen.queryByText("Could not refresh data types. Try again."),
      ).toBeNull(),
    );
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("retains the previous catalogue when a refresh fails and can retry again", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const old = meters(1);
    const latest = meters(2);
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [old] } });
    await screen.findByText(`1 versions; latest ${old.schema.$id}`);
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await waitFor(() => expect(operations).toHaveLength(3));
    await respond(new Error("Refresh failed"));
    await screen.findByText("Could not refresh data types. Try again.");
    expect(
      screen.getByText(`1 versions; latest ${old.schema.$id}`),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(operations).toHaveLength(4));
    await respond(new Error("Retry failed"));
    await screen.findByRole("button", { name: "Retry" });
    expect(
      screen.getByText(`1 versions; latest ${old.schema.$id}`),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(operations).toHaveLength(5));
    await respond({ queryDataTypes: { dataTypes: [old, latest] } });
    await screen.findByText(`2 versions; latest ${latest.schema.$id}`);
    await waitFor(() =>
      expect(
        screen.queryByText("Could not refresh data types. Try again."),
      ).toBeNull(),
    );
  });

  it("discards an in-flight page when restarting a requested refresh", async () => {
    const { link, operations, respond } = createCatalogueLink();
    const old = meters(1);
    const superseded = meters(2);
    const latest = meters(3);
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [old] } });
    await screen.findByText(`1 versions; latest ${old.schema.$id}`);
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await respond({
      queryDataTypes: { dataTypes: [old], cursor: old.schema.$id },
    });
    await waitFor(() => expect(operations).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await waitFor(() => expect(operations).toHaveLength(4));
    expect(operations[2]?.getContext().fetchOptions.signal.aborted).toBe(true);
    await respond({ queryDataTypes: { dataTypes: [superseded] } });
    await waitFor(() => expect(operations).toHaveLength(4));
    expect(operations.at(-1)?.variables).toEqual({ request });
    expect(
      screen.getByText(`1 versions; latest ${old.schema.$id}`),
    ).toBeTruthy();

    await respond({ queryDataTypes: { dataTypes: [old, latest] } });
    await screen.findByText(`2 versions; latest ${latest.schema.$id}`);
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("resolves a refresh only after the final page is published", async () => {
    const { link, respond } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [meters(1)] } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await respond({
      queryDataTypes: { dataTypes: [meters(1)], cursor: meters(1).schema.$id },
    });
    expect(screen.getByTestId("refresh-result").textContent).toBe("pending");
    expect(screen.getByTestId("all-versions").textContent).toBe("1");
    await respond({ queryDataTypes: { dataTypes: [meters(2)] } });
    expect(screen.getByTestId("refresh-result").textContent).toBe("complete");
    expect(screen.getByTestId("all-versions").textContent).toBe("2");
  });

  it("publishes a saved version immediately and ignores an older response arriving last", async () => {
    const { link, operations, respond, respondAt } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [meters(1)] } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await waitFor(() => expect(operations).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Save version 3" }));
    expect(
      screen.getByText(`2 versions; latest ${meters(3).schema.$id}`),
    ).toBeTruthy();
    await waitFor(() => expect(operations).toHaveLength(3));
    await respondAt(2, {
      queryDataTypes: { dataTypes: [meters(1)], cursor: meters(1).schema.$id },
    });
    expect(
      screen.getByText(`2 versions; latest ${meters(3).schema.$id}`),
    ).toBeTruthy();
    await respondAt(3, {
      queryDataTypes: { dataTypes: [meters(2), meters(3)] },
    });
    await respondAt(1, { queryDataTypes: { dataTypes: [meters(1)] } });
    expect(
      screen.getByText(`3 versions; latest ${meters(3).schema.$id}`),
    ).toBeTruthy();
    expect(screen.getByTestId("refresh-result").textContent).toBe("complete");
    expect(operations).toHaveLength(4);
  });

  it("keeps both consecutive saves while superseding an earlier refresh", async () => {
    const { link, operations, respond, respondAt } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [meters(1)] } });
    fireEvent.click(screen.getByRole("button", { name: "Save version 3" }));
    await waitFor(() => expect(operations).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Save version 4" }));
    expect(
      screen.getByText(`3 versions; latest ${meters(4).schema.$id}`),
    ).toBeTruthy();
    await waitFor(() => expect(operations).toHaveLength(3));
    await respondAt(1, new Error("Superseded request failed"));
    expect(captureException).not.toHaveBeenCalled();
    await respondAt(2, {
      queryDataTypes: { dataTypes: [meters(1), meters(3), meters(4)] },
    });
    expect(
      screen.getByText(`3 versions; latest ${meters(4).schema.$id}`),
    ).toBeTruthy();
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("retains a confirmed save if background reconciliation fails", async () => {
    const { link, respond } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [meters(1)] } });
    fireEvent.click(screen.getByRole("button", { name: "Save version 2" }));
    await respond(new Error("Refresh unavailable"));
    expect(
      screen.getByText(`2 versions; latest ${meters(2).schema.$id}`),
    ).toBeTruthy();
    await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await respond({ queryDataTypes: { dataTypes: [meters(1), meters(2)] } });
    expect(
      screen.getByText(`2 versions; latest ${meters(2).schema.$id}`),
    ).toBeTruthy();
  });

  it("loads an empty catalogue without treating it as pending", async () => {
    const { link, respond } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    await respond({ queryDataTypes: { dataTypes: [] } });
    expect(screen.getByTestId("all-versions").textContent).toBe("0");
    expect(screen.queryByText("Loading catalogue")).toBeNull();
  });

  it("reports a repeated cursor instead of fetching indefinitely", async () => {
    const { link, operations, respond } = createCatalogueLink();
    render(
      <MockedProvider link={link}>
        <DataTypesContextProvider>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>,
    );
    const page = {
      queryDataTypes: { dataTypes: [meters(1)], cursor: meters(1).schema.$id },
    };
    await respond(page);
    await respond(page);
    await screen.findByRole("button", { name: "Retry" });
    expect(operations).toHaveLength(2);
    expect(screen.getByText("No catalogue")).toBeTruthy();
  });

  it("starts a separate request after Strict Mode cancels the first mount", async () => {
    const { link, operations, respondAt } = createCatalogueLink();
    renderComponent(
      <StrictMode>
        <SnackbarProvider>
          <MockedProvider link={link}>
            <DataTypesContextProvider>
              <Catalogue />
            </DataTypesContextProvider>
          </MockedProvider>
        </SnackbarProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(operations).toHaveLength(2));
    await respondAt(1, { queryDataTypes: { dataTypes: [meters(2)] } });
    await respondAt(0, { queryDataTypes: { dataTypes: [meters(1)] } });
    expect(
      screen.getByText(`1 versions; latest ${meters(2).schema.$id}`),
    ).toBeTruthy();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("discards the old catalogue and pending requests when the account key changes", async () => {
    const { link, operations, respond, respondAt } = createCatalogueLink();
    const view = (account: string) => (
      <MockedProvider link={link}>
        <DataTypesContextProvider key={account}>
          <Catalogue />
        </DataTypesContextProvider>
      </MockedProvider>
    );
    const { rerender } = render(view("first-account"));
    await respond({ queryDataTypes: { dataTypes: [meters(1)] } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh catalogue" }));
    await waitFor(() => expect(operations).toHaveLength(2));
    rerender(view("second-account"));
    expect(screen.getByText("No catalogue")).toBeTruthy();
    await waitFor(() => expect(operations).toHaveLength(3));
    await respondAt(1, { queryDataTypes: { dataTypes: [meters(1)] } });
    expect(screen.getByText("No catalogue")).toBeTruthy();
    await respondAt(2, { queryDataTypes: { dataTypes: [] } });
    expect(screen.getByTestId("all-versions").textContent).toBe("0");
  });
});
