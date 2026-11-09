import { useApolloClient } from "@apollo/client";
import { useEffect, useState } from "react";

import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";

import { getFlowDefinitionRunsQuery } from "../../../../../../../graphql/queries/knowledge/flow.queries";

import type {
  GetFlowDefinitionRunsQuery,
  GetFlowDefinitionRunsQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { RunSummary } from "./run-list";
import type { ApolloClient } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";

const refreshInterval = 10_000;

export type FlowRuns =
  | { status: "loading" }
  | { status: "failed"; message: string }
  /** `loadedAt` is when the runs were read, which is when running runs' durations are counted to. */
  | { status: "loaded"; runs: RunSummary[]; loadedAt: Date };

/**
 * Reads every page of the flow's runs. The API orders runs by when each last changed, and only sorts within a page,
 * so the Logs tab sorts, filters and counts all of them itself.
 */
const loadAllRuns = async (
  client: ApolloClient<object>,
  flowDefinitionEntityId: EntityId,
) => {
  /* A run that changes while the pages are read can move to a later page, so it's kept once, as last read. */
  const runs = new Map<EntityId, RunSummary>();
  let cursor: string | null = null;

  do {
    const { data }: { data: GetFlowDefinitionRunsQuery } = await client.query<
      GetFlowDefinitionRunsQuery,
      GetFlowDefinitionRunsQueryVariables
    >({
      query: getFlowDefinitionRunsQuery,
      variables: {
        flowDefinitionEntityId,
        cursor,
        limit: flowRunsQueryMaxLimit,
      },
      fetchPolicy: "network-only",
    });

    for (const run of data.getFlowRuns.flowRuns) {
      runs.set(run.flowRunEntityId, run);
    }

    cursor = data.getFlowRuns.nextCursor ?? null;
  } while (cursor !== null);

  return [...runs.values()];
};

/**
 * The flow's runs, read again every few seconds while shown. A failed refresh keeps the runs last read and tries again
 * at the next one.
 */
export const useFlowRuns = (flowDefinitionEntityId: EntityId) => {
  const client = useApolloClient();
  const [flowRuns, setFlowRuns] = useState<FlowRuns>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const runs = await loadAllRuns(client, flowDefinitionEntityId);

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

      if (!stopped) {
        timeout = setTimeout(() => {
          void load();
        }, refreshInterval);
      }
    };

    void load();

    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }, [client, flowDefinitionEntityId, attempt]);

  const retry = () => {
    setFlowRuns({ status: "loading" });
    setAttempt((current) => current + 1);
  };

  return { flowRuns, retry };
};
