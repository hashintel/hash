import { temporalNamespace } from "../../temporal.js";
import { readFlowRunHistoryEvents } from "./get-flow-run-history.js";

import type { Client as TemporalClient } from "@temporalio/client";
import type proto from "@temporalio/proto";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

type CachedHistory = {
  runId: string;
  /** The run's history as of its latest read, which the next read waits for and extends. */
  history: Promise<IHistoryEvent[]>;
  eventCount: number;
  lastReadAt: number;
};

/**
 * A run's events after `lastEventId`, up to `historyLength`. Read newest first, as Temporal can't read forwards from
 * a given event.
 */
const readHistoryEventsAfter = async ({
  temporalClient,
  workflowId,
  runId,
  lastEventId,
  historyLength,
}: {
  temporalClient: TemporalClient;
  workflowId: string;
  runId: string;
  lastEventId: number;
  historyLength: number;
}): Promise<IHistoryEvent[]> => {
  const newestFirst: IHistoryEvent[] = [];
  let nextPageToken: Uint8Array | undefined;

  do {
    const response =
      await temporalClient.workflowService.getWorkflowExecutionHistoryReverse({
        execution: { workflowId, runId },
        /* Just the new events and the last one read, rather than reading back over the cached ones. */
        maximumPageSize: Math.min(historyLength - lastEventId + 1, 100),
        namespace: temporalNamespace,
        nextPageToken,
      });

    nextPageToken = response.nextPageToken;

    for (const event of response.history?.events ?? []) {
      const eventId = Number(event.eventId);

      if (eventId <= lastEventId) {
        return newestFirst.reverse();
      }

      /* Events written since the run was described are left for the next read. */
      if (eventId <= historyLength) {
        newestFirst.push(event);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } while (nextPageToken?.length);

  return newestFirst.reverse();
};

/**
 * The histories of running flow runs, kept between requests so that following a run reads only its new events.
 *
 * A workflow's entry is dropped when it's reset (its run id changes), when it closes, after `maxIdleMs` without being
 * read, or, least recently read first, when the cache holds more than `maxEvents` events. The cap counts events rather
 * than entries, as histories differ hugely in size.
 */
export const createRunningFlowRunHistoryCache = ({
  maxIdleMs = 10 * 60 * 1000,
  maxEvents = 50_000,
}: {
  maxIdleMs?: number;
  maxEvents?: number;
} = {}) => {
  /* In order of when each was last read, least recently first. */
  const entries = new Map<string, CachedHistory>();
  let cachedEventCount = 0;

  const remove = (workflowId: string) => {
    const entry = entries.get(workflowId);

    if (entry) {
      cachedEventCount -= entry.eventCount;
      entries.delete(workflowId);
    }
  };

  const removeIdle = (now: number) => {
    for (const [workflowId, { lastReadAt }] of entries) {
      if (now - lastReadAt < maxIdleMs) {
        return;
      }
      remove(workflowId);
    }
  };

  const removeLeastRecentlyRead = () => {
    for (const workflowId of entries.keys()) {
      if (cachedEventCount <= maxEvents) {
        return;
      }
      remove(workflowId);
    }
  };

  return {
    /** A running run's history, up to the `historyLength` Temporal described it as having. */
    readHistory: ({
      temporalClient,
      workflowId,
      runId,
      historyLength,
    }: {
      temporalClient: TemporalClient;
      workflowId: string;
      runId: string;
      historyLength: number;
    }): Promise<IHistoryEvent[]> => {
      const now = Date.now();
      removeIdle(now);

      const previous =
        entries.get(workflowId)?.runId === runId
          ? entries.get(workflowId)
          : undefined;

      remove(workflowId);

      const entry: CachedHistory = {
        runId,
        eventCount: previous?.eventCount ?? 0,
        lastReadAt: now,
        history: previous
          ? previous.history.then(async (history) => {
              const lastEventId = Number(history.at(-1)?.eventId ?? 0);

              if (historyLength <= lastEventId) {
                return history;
              }

              return [
                ...history,
                ...(await readHistoryEventsAfter({
                  temporalClient,
                  workflowId,
                  runId,
                  lastEventId,
                  historyLength,
                })),
              ];
            })
          : readFlowRunHistoryEvents({
              temporalClient,
              workflowId,
              runId,
            }).then((history) => history.slice(0, historyLength)),
      };

      /* Re-added, to make it the most recently read. */
      entries.set(workflowId, entry);
      cachedEventCount += entry.eventCount;

      return entry.history.then(
        (history) => {
          if (entries.get(workflowId) === entry) {
            cachedEventCount += history.length - entry.eventCount;
            entry.eventCount = history.length;
            removeLeastRecentlyRead();
          }
          return history;
        },
        (error: unknown) => {
          if (entries.get(workflowId) === entry) {
            remove(workflowId);
          }
          throw error;
        },
      );
    },

    /** Drops the history of a workflow, e.g. because it has closed. */
    delete: remove,
  };
};

export type RunningFlowRunHistoryCache = ReturnType<
  typeof createRunningFlowRunHistoryCache
>;
