import { useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";

import { getInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import { getFlowRunById } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";
import { useFlowDefinitionAtTime } from "../../../../../../shared/use-flow-definitions";
import { useFlowRunEvents } from "../../../../../../shared/use-flow-run-events";
import { getStepRunMarks } from "../shared/step-states";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
} from "../../../../../../../graphql/api-types.gen";
import type { StepRunMark } from "../shared/step-states";
import type { ApolloError } from "@apollo/client";
import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

const pollIntervalMs = 2_000;

/** How long a run is looked for before it's reported missing: one just started is recorded a moment later. */
const notFoundGraceMs = 10_000;

export type Run =
  | { status: "loading" }
  | { status: "notFound" }
  /** The run is of a flow other than the one open. */
  | { status: "otherFlow" }
  | { status: "failed"; message: string; retry: (() => void) | null }
  | {
      status: "loaded";
      /**
       * The flow as the run ran it: the edition current when it started. `null` if that couldn't be read, when the
       * run is shown on the flow as it is now.
       */
      ranDefinition: FlowDefinition<string> | null;
      marks: Map<string, StepRunMark>;
      /** The runs of its steps by step run id: a step's id, or for a step inside a for-each step, one per item. */
      stepRuns: Map<string, FlowRunStepRunState>;
      /** The ids of the step runs waiting on a person to answer their questions. */
      waitingOnPerson: Set<string>;
      /** Whether it's still going, so more of its steps will run. */
      live: boolean;
      /** Why the last check for the run's new events failed, while it keeps checking. */
      checkFailure: string | null;
    };

const isNotFound = (error: ApolloError) =>
  error.graphQLErrors.some(({ extensions }) => extensions.code === "NOT_FOUND");

/**
 * A run of the flow, followed while it's running: its status, its steps' runs and marks from its events, and the
 * edition of the flow it ran.
 */
export const useRun = ({
  flowRunEntityId,
  flowDefinitionEntityId,
  currentDefinition,
}: {
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
  /** The flow as it is now, whose steps are drawn if the run's edition can't be read. */
  currentDefinition: FlowDefinition<string>;
}): Run => {
  const { data, error, refetch, startPolling, stopPolling } = useQuery<
    GetFlowRunByIdQuery,
    GetFlowRunByIdQueryVariables
  >(getFlowRunById, {
    variables: { flowRunEntityId },
    fetchPolicy: "cache-and-network",
  });

  const run = data?.getFlowRunById;
  const live = run?.status === FlowRunStatus.Running;

  const [lookedLongEnough, setLookedLongEnough] = useState(false);
  const [lookCount, setLookCount] = useState(0);
  const stillLooking =
    !run && !!error && isNotFound(error) && !lookedLongEnough;

  useEffect(() => {
    const timeout = setTimeout(
      () => setLookedLongEnough(true),
      notFoundGraceMs,
    );

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!stillLooking) {
      return;
    }

    const timeout = setTimeout(() => {
      refetch()
        .catch(() => undefined)
        .finally(() => setLookCount((count) => count + 1));
    }, pollIntervalMs);

    return () => clearTimeout(timeout);
  }, [stillLooking, lookCount, refetch]);

  /* Its status is checked while it runs, so that once it stops, its events are read one last time and no more. */
  useEffect(() => {
    if (!live) {
      return;
    }

    startPolling(pollIntervalMs);

    return stopPolling;
  }, [live, startPolling, stopPolling]);

  const ofThisFlow = run?.flowDefinitionEntityId === flowDefinitionEntityId;

  const events = useFlowRunEvents({
    flowRunEntityId: run && ofThisFlow ? flowRunEntityId : null,
    live,
  });

  const { flowDefinition: ranFlow, loading: ranFlowLoading } =
    useFlowDefinitionAtTime({
      flowDefinitionEntityId: run && ofThisFlow ? flowDefinitionEntityId : null,
      timestamp: run && ofThisFlow ? (run.startedAt as Timestamp) : null,
    });
  const ranDefinition = ranFlow?.flowDefinition ?? null;

  const steps = useMemo(() => {
    if (!run || events.status !== "loaded") {
      return null;
    }

    try {
      const stepRuns = getStepRunsFromEvents(events.events, run);

      return {
        marks: getStepRunMarks({
          steps: (ranDefinition ?? currentDefinition).steps,
          stepRuns,
          events: events.events,
          live,
        }),
        stepRuns: new Map(stepRuns.map((stepRun) => [stepRun.stepId, stepRun])),
        /* Requests for web pages are answered by the browser plugin, not a person. */
        waitingOnPerson: new Set(
          getInputRequests(events.events).flatMap(
            ({ stepId, type, resolvedAt }) =>
              type === "human-input" && !resolvedAt ? [stepId] : [],
          ),
        ),
      };
    } catch (stepRunsError) {
      /* Events that don't add up are reported, rather than thrown. */
      return stepRunsError instanceof Error
        ? stepRunsError
        : new Error(String(stepRunsError));
    }
  }, [run, events, ranDefinition, currentDefinition, live]);

  if (error && !run) {
    if (stillLooking) {
      return { status: "loading" };
    }

    return isNotFound(error)
      ? { status: "notFound" }
      : {
          status: "failed",
          message: error.message,
          retry: () => {
            void refetch();
          },
        };
  }

  if (!run) {
    return { status: "loading" };
  }

  if (!ofThisFlow) {
    return { status: "otherFlow" };
  }

  if (events.status === "failed") {
    /* It's read again until a read succeeds. */
    return { status: "failed", message: events.message, retry: null };
  }

  if (steps instanceof Error) {
    return { status: "failed", message: steps.message, retry: null };
  }

  if (events.status !== "loaded" || !steps || ranFlowLoading) {
    return { status: "loading" };
  }

  return {
    status: "loaded",
    ranDefinition,
    marks: steps.marks,
    stepRuns: steps.stepRuns,
    waitingOnPerson: steps.waitingOnPerson,
    live,
    checkFailure: events.checkFailure ?? null,
  };
};
