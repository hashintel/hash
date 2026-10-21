import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import {
  buildFlowRunEvents,
  getFlowRunHistory,
  pageFlowRunEvents,
} from "@local/hash-backend-utils/flows/run-events";

import * as Error from "../../error";

import type {
  FlowRun,
  FlowRunEventsArgs,
  ResolverFn,
  ResolversTypes,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

export const flowRunEventsResolver: ResolverFn<
  ResolversTypes["FlowRunEventsPage"],
  FlowRun | SparseFlowRun,
  Pick<GraphQLContext, "authentication" | "dataSources" | "temporal">,
  FlowRunEventsArgs
> = async ({ flowRunEntityId }, { after, first }, context) => {
  const flowRunEntity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient: context.dataSources.graphApi,
    userAuthentication: context.authentication,
  });

  if (!flowRunEntity) {
    throw Error.notFound(`Flow run with id ${flowRunEntityId} not found`);
  }

  const { workflow, history } = await getFlowRunHistory({
    temporalClient: context.temporal,
    workflowId:
      flowRunEntity.properties[
        "https://hash.ai/@h/types/property-type/workflow-id/"
      ],
  });

  const events = buildFlowRunEvents(history);

  try {
    return pageFlowRunEvents({ events, runId: workflow.runId, after, first });
  } catch (error) {
    throw Error.badRequest((error as Error).message);
  }
};

const eventTypeNamesByKind = {
  runStarted: "FlowRunStartedEvent",
  stepStarted: "FlowRunStepStartedEvent",
  attemptStarted: "FlowRunAttemptStartedEvent",
  attemptSucceeded: "FlowRunAttemptSucceededEvent",
  attemptFailed: "FlowRunAttemptFailedEvent",
  stepGaveUp: "FlowRunStepGaveUpEvent",
  attemptCancellationRequested: "FlowRunAttemptCancellationRequestedEvent",
  attemptCancelled: "FlowRunAttemptCancelledEvent",
  stepSkipped: "FlowRunStepSkippedEvent",
  forEachStarted: "FlowRunForEachStartedEvent",
  inputRequested: "FlowRunInputRequestedEvent",
  inputResolved: "FlowRunInputResolvedEvent",
  progressLogged: "FlowRunProgressLoggedEvent",
  runReset: "FlowRunResetEvent",
  runFinished: "FlowRunFinishedEvent",
} as const satisfies Record<FlowRunEvent["kind"], string>;

export const resolveFlowRunEventType = ({ kind }: FlowRunEvent) =>
  eventTypeNamesByKind[kind];
