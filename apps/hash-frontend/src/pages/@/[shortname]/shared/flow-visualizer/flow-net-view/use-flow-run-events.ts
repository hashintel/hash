import { useApolloClient } from "@apollo/client";
import { useEffect, useState } from "react";

import { getFlowRunEventsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { FlowStepGaveUpReason } from "../../../../../../graphql/api-types.gen";

import type {
  GetFlowRunEventsQuery,
  GetFlowRunEventsQueryVariables,
} from "../../../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
  FlowStepGaveUpReason as FlowRunEventGaveUpReason,
} from "@local/hash-isomorphic-utils/flows/run-events";

type FlowRunEventsPage = GetFlowRunEventsQuery["getFlowRunById"]["events"];

type QueriedFlowRunEvent = FlowRunEventsPage["events"][number];

/** The most events the API returns in a page. */
const pageSize = 2_000;

const pollIntervalMs = 2_000;

const gaveUpReasons = {
  [FlowStepGaveUpReason.AttemptsExhausted]: "attemptsExhausted",
  [FlowStepGaveUpReason.ErrorStatus]: "errorStatus",
  [FlowStepGaveUpReason.NonRetryable]: "nonRetryable",
  [FlowStepGaveUpReason.Other]: "other",
  [FlowStepGaveUpReason.TimedOut]: "timedOut",
} as const satisfies Record<FlowStepGaveUpReason, FlowRunEventGaveUpReason>;

const toStepRun = ({
  stepId,
  itemPath,
}: FlowRunEventStepRun): FlowRunEventStepRun => ({ stepId, itemPath });

/** An event as the API returns it, as the `FlowRunEvent` it was made from. */
const toFlowRunEvent = (event: QueriedFlowRunEvent): FlowRunEvent => {
  const { position, occurredAt } = event;

  switch (event.__typename) {
    case "FlowRunStartedEvent":
      return {
        position,
        occurredAt,
        kind: "runStarted",
        flowInputs: event.flowInputs,
      };
    case "FlowRunStepStartedEvent":
      return {
        position,
        occurredAt,
        kind: "stepStarted",
        stepRun: toStepRun(event.stepRun),
        stepType: event.stepType,
        inputs: event.inputs,
      };
    case "FlowRunAttemptStartedEvent":
      return {
        position,
        occurredAt,
        kind: "attemptStarted",
        stepRun: toStepRun(event.stepRun),
        attempt: event.attempt,
        ...(event.hiddenAttempts
          ? {
              hiddenAttempts: {
                count: event.hiddenAttempts.count,
                ...(event.hiddenAttempts.lastError
                  ? {
                      lastError: {
                        message: event.hiddenAttempts.lastError.message,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };
    case "FlowRunAttemptSucceededEvent":
      return {
        position,
        occurredAt,
        kind: "attemptSucceeded",
        stepRun: toStepRun(event.stepRun),
        attempt: event.attempt,
        outputs: event.outputs,
        ...(event.message != null ? { message: event.message } : {}),
      };
    case "FlowRunAttemptFailedEvent":
      return {
        position,
        occurredAt,
        kind: "attemptFailed",
        stepRun: toStepRun(event.stepRun),
        attempt: event.attempt,
        error: { message: event.error.message },
        retrying: event.retrying,
      };
    case "FlowRunStepGaveUpEvent":
      return {
        position,
        occurredAt,
        kind: "stepGaveUp",
        stepRun: toStepRun(event.stepRun),
        attempt: event.attempt,
        reason: gaveUpReasons[event.reason],
      };
    case "FlowRunAttemptCancellationRequestedEvent":
      return {
        position,
        occurredAt,
        kind: "attemptCancellationRequested",
        stepRun: toStepRun(event.stepRun),
      };
    case "FlowRunAttemptCancelledEvent":
      return {
        position,
        occurredAt,
        kind: "attemptCancelled",
        stepRun: toStepRun(event.stepRun),
      };
    case "FlowRunStepSkippedEvent":
      return {
        position,
        occurredAt,
        kind: "stepSkipped",
        stepRun: toStepRun(event.stepRun),
        stepType: event.stepType,
      };
    case "FlowRunForEachStartedEvent":
      return {
        position,
        occurredAt,
        kind: "forEachStarted",
        stepRun: toStepRun(event.stepRun),
        itemCount: event.itemCount,
      };
    case "FlowRunInputRequestedEvent":
      return {
        position,
        occurredAt,
        kind: "inputRequested",
        stepRun: toStepRun(event.stepRun),
        request: event.request,
      };
    case "FlowRunInputResolvedEvent":
      return {
        position,
        occurredAt,
        kind: "inputResolved",
        ...(event.requestStepRun
          ? { requestStepRun: toStepRun(event.requestStepRun) }
          : {}),
        requestId: event.requestId,
        response: event.response,
      };
    case "FlowRunProgressLoggedEvent":
      return {
        position,
        occurredAt,
        kind: "progressLogged",
        stepRun: toStepRun(event.stepRun),
        ...(typeof event.loggedInAttempt === "number"
          ? { loggedInAttempt: event.loggedInAttempt }
          : {}),
        log: event.log,
      };
    case "FlowRunResetEvent":
      return {
        position,
        occurredAt,
        kind: "runReset",
        fromRunId: event.fromRunId,
      };
    case "FlowRunFinishedEvent":
      return {
        position,
        occurredAt,
        kind: "runFinished",
        status: event.status as Extract<
          FlowRunEvent,
          { kind: "runFinished" }
        >["status"],
        ...(event.flowOutputs ? { flowOutputs: event.flowOutputs } : {}),
        ...(event.failure
          ? { failure: { message: event.failure.message } }
          : {}),
        ...(event.stepErrors
          ? {
              stepErrors: event.stepErrors.map(({ stepRun, error }) => ({
                stepRun: toStepRun(stepRun),
                error: { message: error.message },
              })),
            }
          : {}),
      };
  }
};

/**
 * Applies a page to the events read so far. A page from a run that was reset past the cursor drops the events the
 * reset undid first.
 */
const withPage = (
  events: readonly FlowRunEvent[],
  page: FlowRunEventsPage,
): FlowRunEvent[] => {
  const kept = page.restarted
    ? events.slice(
        0,
        page.keptUpTo
          ? events.findIndex(({ position }) => position === page.keptUpTo) + 1
          : 0,
      )
    : events;

  return [...kept, ...page.events.map(toFlowRunEvent)];
};

export type FlowRunEvents =
  | { status: "loading" }
  | { status: "loaded"; events: FlowRunEvent[]; runId: string }
  | { status: "failed"; message: string };

/**
 * A flow run's events. While the run is `live`, it checks for new ones every couple of seconds.
 */
export const useFlowRunEvents = ({
  flowRunEntityId,
  live,
}: {
  flowRunEntityId: EntityId;
  live: boolean;
}): FlowRunEvents => {
  const apolloClient = useApolloClient();
  const [read, setRead] = useState<{
    flowRunEntityId: EntityId;
    result: FlowRunEvents;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimeout: ReturnType<typeof setTimeout> | undefined;
    let events: FlowRunEvent[] = [];
    let cursor: string | null = null;

    const readNewEvents = async () => {
      let runId: string | undefined;

      for (let hasNextPage = true; hasNextPage;) {
        const { data } = await apolloClient.query<
          GetFlowRunEventsQuery,
          GetFlowRunEventsQueryVariables
        >({
          query: getFlowRunEventsQuery,
          variables: { flowRunEntityId, after: cursor, first: pageSize },
          fetchPolicy: "no-cache",
        });

        const page = data.getFlowRunById.events;

        events = withPage(events, page);
        cursor = page.endCursor ?? cursor;
        runId = page.runId;
        hasNextPage = page.hasNextPage;
      }

      if (!cancelled && runId !== undefined) {
        setRead({
          flowRunEntityId,
          result: { status: "loaded", events, runId },
        });
      }
    };

    const poll = () => {
      readNewEvents().then(
        () => {
          if (live && !cancelled) {
            pollTimeout = setTimeout(poll, pollIntervalMs);
          }
        },
        (error: unknown) => {
          if (!cancelled) {
            setRead({
              flowRunEntityId,
              result: {
                status: "failed",
                message: error instanceof Error ? error.message : String(error),
              },
            });
          }
        },
      );
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(pollTimeout);
    };
  }, [apolloClient, flowRunEntityId, live]);

  return read?.flowRunEntityId === flowRunEntityId
    ? read.result
    : { status: "loading" };
};
