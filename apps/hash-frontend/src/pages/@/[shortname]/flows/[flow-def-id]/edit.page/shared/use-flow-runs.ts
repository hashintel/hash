import { useApolloClient } from "@apollo/client";
import { useEffect, useState } from "react";

import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";

import { getFlowDefinitionRunsQuery } from "../../../../../../../graphql/queries/knowledge/flow.queries";

import type {
  FlowRunSummary,
  GetFlowDefinitionRunsQuery,
  GetFlowDefinitionRunsQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { ApolloQueryResult, QueryOptions } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";

const refreshInterval = 10_000;

/** A run as the flow's list of runs has it. */
export type RunSummary = Pick<
  FlowRunSummary,
  | "flowRunEntityId"
  | "flowScheduleId"
  | "webId"
  | "status"
  | "startedAt"
  | "closedAt"
  | "openInputRequests"
>;

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
 * Reads pages of the flow's runs into `runs`, from the first until `isLastPage` or there are no more: a run read
 * again replaces the one read before, and a new one is added. `totalCount` is how many runs the API has for the flow.
 */
const readPages = async ({
  client,
  flowDefinitionEntityId,
  fetchPolicy,
  runs,
  isLastPage,
}: {
  client: FlowRunsClient;
  flowDefinitionEntityId: EntityId;
  fetchPolicy: "cache-first" | "network-only";
  runs: RunSummary[];
  isLastPage: (page: RunSummary[]) => boolean;
}) => {
  /* A run that changes while the pages are read can move to a later page, so it's kept once, as last read. */
  const merged = new Map(runs.map((run) => [run.flowRunEntityId, run]));
  let cursor: string | null = null;
  let totalCount = 0;

  do {
    const { data } = await client.query({
      query: getFlowDefinitionRunsQuery,
      variables: { ...firstPageVariables(flowDefinitionEntityId), cursor },
      fetchPolicy,
    });

    const page = data.getFlowRuns.flowRuns;

    for (const run of page) {
      merged.set(run.flowRunEntityId, run);
    }

    totalCount = data.getFlowRuns.totalCount;
    cursor = isLastPage(page) ? null : (data.getFlowRuns.nextCursor ?? null);
  } while (cursor !== null);

  return { runs: [...merged.values()], totalCount };
};

/**
 * Reads every page of the flow's runs. The API orders runs by when each last changed, and only sorts within a page,
 * so the Logs tab sorts, filters and counts all of them itself.
 */
export const loadAllRuns = async (
  client: FlowRunsClient,
  flowDefinitionEntityId: EntityId,
  fetchPolicy: "cache-first" | "network-only",
) => {
  const { runs } = await readPages({
    client,
    flowDefinitionEntityId,
    fetchPolicy,
    runs: [],
    isLastPage: () => false,
  });

  return runs;
};

/**
 * Reads the runs that changed since `runs` were read into them. The API gives the runs that changed most recently
 * first, so pages are read until one holds a run that changed before the latest change in `runs`. A run that's gone,
 * such as an archived one, isn't among those, so when the API has a different number of runs than were read, every
 * page is read again.
 */
export const loadRecentRuns = async (
  client: FlowRunsClient,
  flowDefinitionEntityId: EntityId,
  runs: RunSummary[],
) => {
  const latestChange = runs.reduce(
    (latest, { updatedAt }) => Math.max(latest, Date.parse(updatedAt)),
    -Infinity,
  );

  const recent = await readPages({
    client,
    flowDefinitionEntityId,
    fetchPolicy: "network-only",
    runs,
    isLastPage: (page) =>
      page.some(({ updatedAt }) => Date.parse(updatedAt) < latestChange),
  });

  return recent.runs.length === recent.totalCount
    ? recent.runs
    : loadAllRuns(client, flowDefinitionEntityId, "network-only");
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
 * The flow's runs. Every page is read when shown; after that, the runs that changed since the last read are read every
 * few seconds while the page is visible, and when it's shown again. Runs read on an earlier visit show at once, until
 * the fresh read replaces them. A failed refresh keeps the runs last read and tries again at the next one.
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
    /* The runs last read, which a refresh of the ones that changed since is merged into. */
    let lastRead: RunSummary[] | null = null;

    const read = async (load: () => Promise<RunSummary[]>) => {
      try {
        const runs = await load();

        if (!stopped) {
          lastRead = runs;
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

    const refresh = async (readEveryPage: boolean) => {
      await read(() =>
        readEveryPage || !lastRead
          ? loadAllRuns(client, flowDefinitionEntityId, "network-only")
          : loadRecentRuns(client, flowDefinitionEntityId, lastRead),
      );

      if (stopped) {
        return;
      }

      timeout = setTimeout(() => {
        if (document.visibilityState === "visible") {
          void refresh(false);
        } else {
          refreshDue = true;
        }
      }, refreshInterval);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && refreshDue) {
        refreshDue = false;
        void refresh(false);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    const start = async () => {
      if (hasCachedRuns(client, flowDefinitionEntityId)) {
        await read(() =>
          loadAllRuns(client, flowDefinitionEntityId, "cache-first"),
        );
      }

      if (!stopped) {
        await refresh(true);
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
