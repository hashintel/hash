import { useApolloClient } from "@apollo/client";
import { useEffect, useRef, useState } from "react";

import { getFlowRunEventsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import type {
  GetFlowRunEventsQuery,
  GetFlowRunEventsQueryVariables,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";

type FlowRunEventsPage = GetFlowRunEventsQuery["getFlowRunById"]["events"];

/** The most events the API returns in a page. */
const pageSize = 2_000;

const pollIntervalMs = 2_000;

/**
 * The events read so far that a page keeps. A page from a run that was reset past the cursor keeps those up to its
 * `keptUpTo`, or none if it has none. If they don't include `keptUpTo`, which they kept can't be told: `null`.
 */
const eventsKeptBy = (
  events: FlowRunEvent[],
  page: FlowRunEventsPage,
): FlowRunEvent[] | null => {
  if (!page.restarted) {
    return events;
  }

  if (!page.keptUpTo) {
    return [];
  }

  const keptUpToIndex = events.findIndex(
    ({ position }) => position === page.keptUpTo,
  );

  return keptUpToIndex === -1 ? null : events.slice(0, keptUpToIndex + 1);
};

export type FlowRunEvents =
  | { status: "loading" }
  | {
      status: "loaded";
      events: FlowRunEvent[];
      runId: string;
      /** Why the last check for new events failed, while it keeps checking. */
      checkFailure?: string;
    }
  | { status: "failed"; message: string };

/**
 * A flow run's events. While the run is `live`, it checks for new ones every couple of seconds. A read that fails is
 * tried again until one succeeds, live or not.
 */
export const useFlowRunEvents = ({
  flowRunEntityId,
  live,
}: {
  flowRunEntityId: EntityId | null;
  live: boolean;
}): FlowRunEvents => {
  const apolloClient = useApolloClient();
  const [read, setRead] = useState<{
    flowRunEntityId: EntityId;
    result: FlowRunEvents;
  } | null>(null);

  /** Kept across `live` changes, so a run that closes is not read again from the start. */
  const readSoFar = useRef<{
    flowRunEntityId: EntityId;
    events: FlowRunEvent[];
    cursor: string | null;
  } | null>(null);

  useEffect(() => {
    if (!flowRunEntityId) {
      return;
    }

    let cancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | undefined;

    if (readSoFar.current?.flowRunEntityId !== flowRunEntityId) {
      readSoFar.current = { flowRunEntityId, events: [], cursor: null };
    }
    const progress = readSoFar.current;

    const readNewEvents = async () => {
      let runId: string | undefined;
      let changed = false;

      for (let hasNextPage = true; hasNextPage;) {
        const { data } = await apolloClient.query<
          GetFlowRunEventsQuery,
          GetFlowRunEventsQueryVariables
        >({
          query: getFlowRunEventsQuery,
          variables: {
            flowRunEntityId,
            after: progress.cursor,
            first: pageSize,
          },
          fetchPolicy: "no-cache",
        });

        if (cancelled) {
          return;
        }

        const page = data.getFlowRunById.events;
        const kept = eventsKeptBy(progress.events, page);

        if (!kept) {
          /* Read again from the start, as which events the reset kept can't be told. */
          progress.events = [];
          progress.cursor = null;
          changed = true;
          continue;
        }

        if (page.restarted || page.events.length > 0) {
          progress.events = [...kept, ...page.events];
          changed = true;
        }
        progress.cursor = page.endCursor ?? progress.cursor;
        runId = page.runId;
        hasNextPage = page.hasNextPage;
      }

      if (!cancelled && runId !== undefined) {
        const loadedRunId = runId;

        /* An unchanged result keeps its identity, so what's derived from it isn't recomputed for nothing. */
        setRead((previous) =>
          !changed &&
          previous?.flowRunEntityId === flowRunEntityId &&
          previous.result.status === "loaded" &&
          previous.result.runId === loadedRunId &&
          previous.result.checkFailure === undefined
            ? previous
            : {
                flowRunEntityId,
                result: {
                  status: "loaded",
                  events: progress.events,
                  runId: loadedRunId,
                },
              },
        );
      }
    };

    const poll = () => {
      const pollAgain = () => {
        if (!cancelled) {
          pollTimeout = setTimeout(poll, pollIntervalMs);
        }
      };

      readNewEvents().then(
        () => {
          if (live) {
            pollAgain();
          }
        },
        (error: unknown) => {
          if (!cancelled) {
            const message =
              error instanceof Error ? error.message : String(error);

            /* Events already shown stay shown: a check that fails is usually tried again successfully. */
            setRead((previous) =>
              previous?.flowRunEntityId === flowRunEntityId &&
              previous.result.status === "loaded"
                ? {
                    flowRunEntityId,
                    result: { ...previous.result, checkFailure: message },
                  }
                : { flowRunEntityId, result: { status: "failed", message } },
            );
          }

          pollAgain();
        },
      );
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(pollTimeout);
    };
  }, [apolloClient, flowRunEntityId, live]);

  return flowRunEntityId && read?.flowRunEntityId === flowRunEntityId
    ? read.result
    : { status: "loading" };
};
