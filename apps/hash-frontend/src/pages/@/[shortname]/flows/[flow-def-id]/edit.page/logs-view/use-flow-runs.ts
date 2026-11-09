import { useApolloClient } from "@apollo/client";
import { useEffect, useState } from "react";

import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";

import { getFlowDefinitionRunsQuery } from "../../../../../../../graphql/queries/knowledge/flow.queries";

import type {
  GetFlowDefinitionRunsQuery,
  GetFlowDefinitionRunsQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { RunSummary } from "./run-list";
import type { ApolloQueryResult, QueryOptions } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";

const refreshInterval = 10_000;

export type FlowRuns =
  | { status: "loading" }
  | { status: "failed"; message: string }
  /** `loadedAt` is when the runs were read, which is when running runs' durations are counted to. */
  | { status: "loaded"; runs: RunSummary[]; loadedAt: Date };

type RunsQueryOptions = QueryOptions<
  GetFlowDefinitionRunsQueryVariables,
  GetFlowDefinitionRunsQuery
>;

/** What this reads the runs with: an `ApolloClient`, or a stand-in for one in a test. */
export type FlowRunsClient = {
  query: (
    options: RunsQueryOptions,
  ) => Promise<ApolloQueryResult<GetFlowDefinitionRunsQuery>>;
  readQuery: (
    options: Pick<RunsQueryOptions, "query" | "variables">,
  ) => GetFlowDefinitionRunsQuery | null;
};

const firstPageVariables = (
  flowDefinitionEntityId: EntityId,
): GetFlowDefinitionRunsQueryVariables => ({
  flowDefinitionEntityId,
  cursor: null,
  limit: flowRunsQueryMaxLimit,
});

/**
 * Reads every page of the flow's runs. The API orders runs by when each last changed, and only sorts within a page,
 * so the Logs tab sorts, filters and counts all of them itself.
 */
export const loadAllRuns = async (
  client: FlowRunsClient,
  flowDefinitionEntityId: EntityId,
  fetchPolicy: "cache-first" | "network-only",
) => {
  /* A run that changes while the pages are read can move to a later page, so it's kept once, as last read. */
  const runs = new Map<EntityId, RunSummary>();
  let cursor: string | null = null;

  do {
    const { data } = await client.query({
      query: getFlowDefinitionRunsQuery,
      variables: { ...firstPageVariables(flowDefinitionEntityId), cursor },
      fetchPolicy,
    });

    for (const run of data.getFlowRuns.flowRuns) {
      runs.set(run.flowRunEntityId, run);
    }

    cursor = data.getFlowRuns.nextCursor ?? null;
  } while (cursor !== null);

  return [...runs.values()];
};

/** Whether the flow's runs were read before, so are in the cache. */
const hasCachedRuns = (
  client: FlowRunsClient,
  flowDefinitionEntityId: EntityId,
) =>
  client.readQuery({
    query: getFlowDefinitionRunsQuery,
    variables: firstPageVariables(flowDefinitionEntityId),
  }) !== null;

/**
 * The flow's runs, read again every few seconds while shown and the page is visible. Runs read on an earlier visit
 * show at once, until the fresh read replaces them. A failed refresh keeps the runs last read and tries again at the
 * next one.
 */
export const useFlowRuns = (flowDefinitionEntityId: EntityId) => {
  const client = useApolloClient();
  const [flowRuns, setFlowRuns] = useState<FlowRuns>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    /* Set when a refresh fell due while the page was hidden, to refresh as soon as it's shown. */
    let refreshDue = false;

    const read = async (fetchPolicy: "cache-first" | "network-only") => {
      try {
        const runs = await loadAllRuns(
          client,
          flowDefinitionEntityId,
          fetchPolicy,
        );

        if (!stopped) {
          setFlowRuns({ status: "loaded", runs, loadedAt: new Date() });
        }
      } catch (error) {
        if (!stopped) {
          setFlowRuns((current) =>
            current.status === "loaded"
              ? current
              : {
                  status: "failed",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
          );
        }
      }
    };

    const refresh = async () => {
      await read("network-only");

      if (stopped) {
        return;
      }

      timeout = setTimeout(() => {
        if (document.visibilityState === "visible") {
          void refresh();
        } else {
          refreshDue = true;
        }
      }, refreshInterval);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && refreshDue) {
        refreshDue = false;
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    const start = async () => {
      if (hasCachedRuns(client, flowDefinitionEntityId)) {
        await read("cache-first");
      }

      if (!stopped) {
        await refresh();
      }
    };

    void start();

    return () => {
      stopped = true;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, flowDefinitionEntityId, attempt]);

  const retry = () => {
    setFlowRuns({ status: "loading" });
    setAttempt((current) => current + 1);
  };

  return { flowRuns, retry };
};
