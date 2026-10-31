import { getFlowRunProgressQuery } from "../../../../graphql/queries/knowledge/flow.queries";

import type {
  GetFlowRunProgressQuery,
  GetFlowRunProgressQueryVariables,
} from "../../../../graphql/api-types.gen";
import type { ApolloClient } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

export type FlowRunProgress = Omit<
  GetFlowRunProgressQuery["getFlowRunById"],
  "events"
> & { events: FlowRunEvent[] };

/** A run's status, how it ended if it has, and all its events so far. */
export const queryFlowRunProgress = async (
  apolloClient: ApolloClient<unknown>,
  flowRunEntityId: EntityId,
): Promise<FlowRunProgress> => {
  const queryPage = async (after: string | null) => {
    const { data } = await apolloClient.query<
      GetFlowRunProgressQuery,
      GetFlowRunProgressQueryVariables
    >({
      query: getFlowRunProgressQuery,
      variables: { flowRunEntityId, after },
      fetchPolicy: "network-only",
    });

    return data.getFlowRunById;
  };

  const { events: firstPage, ...flowRun } = await queryPage(null);
  const events: FlowRunEvent[] = [...firstPage.events];
  let page = firstPage;

  while (page.hasNextPage) {
    page = (await queryPage(page.endCursor ?? null)).events;

    /* The run was reset past what's been read, so read it again from the start, along with its status and outputs. */
    if (page.restarted) {
      return queryFlowRunProgress(apolloClient, flowRunEntityId);
    }

    events.push(...page.events);
  }

  return { ...flowRun, events };
};

export type StepProgress = {
  /** When the step was last scheduled. */
  scheduledAt?: string;
  /** When the step's last scheduling succeeded, gave up or was cancelled. */
  closedAt?: string;
  /** The outputs of the step's last scheduling, if it succeeded. */
  outputs?: StepOutput[];
};

/** How far a step outside any `forEach` has got, from its run's events. */
export const getStepProgress = (
  events: FlowRunEvent[],
  stepId: string,
): StepProgress => {
  let progress: StepProgress = {};

  for (const event of events) {
    if (
      !("stepRun" in event) ||
      event.stepRun.stepId !== stepId ||
      event.stepRun.itemPath.length > 0
    ) {
      continue;
    }

    switch (event.kind) {
      case "stepStarted":
        progress = { scheduledAt: event.occurredAt };
        break;
      case "attemptSucceeded":
        progress = {
          ...progress,
          closedAt: event.occurredAt,
          outputs: event.outputs,
        };
        break;
      case "stepGaveUp":
      case "attemptCancelled":
        progress = { ...progress, closedAt: event.occurredAt };
        break;
    }
  }

  return progress;
};

export const getOutputValue = <Value>(
  outputs:
    | { outputName: string; payload: { value: unknown } }[]
    | null
    | undefined,
  outputName: string,
): Value | null =>
  (outputs?.find((output) => output.outputName === outputName)?.payload
    .value as Value | undefined) ?? null;
