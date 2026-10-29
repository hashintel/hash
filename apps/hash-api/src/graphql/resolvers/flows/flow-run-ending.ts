import { resolvePayloadValue } from "@local/hash-backend-utils/flows/payload-storage";
import { findRunFinishedEvent } from "@local/hash-isomorphic-utils/flows/run-events";

import { FlowRunStatus } from "../../api-types.gen";
import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type {
  FlowRunError,
  FlowRunOutput,
  FlowRunStepError,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { FlowRunParent } from "./shared/get-record-of-flow-run";
import type { ResolvedPayload } from "@local/hash-isomorphic-utils/flows/types";

type FlowRunEndingContext = Pick<
  GraphQLContext,
  | "authentication"
  | "dataSources"
  | "flowRunRecords"
  | "runningFlowRunHistories"
  | "temporal"
>;

type FlowRunEndingResolver<Result> = ResolverFn<
  Result | null,
  FlowRunParent,
  FlowRunEndingContext,
  Record<string, never>
>;

/** The statuses of a run that has a `runFinished` event. */
const endedStatuses: FlowRunStatus[] = [
  FlowRunStatus.Completed,
  FlowRunStatus.Failed,
  FlowRunStatus.Cancelled,
  FlowRunStatus.Terminated,
  FlowRunStatus.TimedOut,
];

/** How a run ended, from its record. A run that hasn't ended has no ending to read, so its record isn't read. */
const getFlowRunEnding = async (
  flowRun: FlowRunParent,
  context: FlowRunEndingContext,
) => {
  if (!endedStatuses.includes(flowRun.status)) {
    return null;
  }

  const { header, events } = await getRecordOfFlowRun(flowRun, context);
  const runFinished = findRunFinishedEvent(events);

  return runFinished ? { workflowId: header.workflowId, runFinished } : null;
};

export const flowRunOutputsResolver: FlowRunEndingResolver<
  FlowRunOutput[]
> = async (flowRun, _args, context) => {
  const ending = await getFlowRunEnding(flowRun, context);
  const outputs = ending?.runFinished.flowOutputs;

  if (!ending || !outputs) {
    return null;
  }

  return Promise.all(
    outputs.map(async ({ outputName, payload }) => ({
      outputName,
      payload: {
        kind: payload.kind,
        value: await resolvePayloadValue(
          {
            storageProvider: context.dataSources.uploadProvider,
            workflowId: ending.workflowId,
          },
          payload.kind,
          payload.value,
        ),
      } as ResolvedPayload,
    })),
  );
};

export const flowRunFailureResolver: FlowRunEndingResolver<
  FlowRunError
> = async (flowRun, _args, context) =>
  (await getFlowRunEnding(flowRun, context))?.runFinished.failure ?? null;

export const flowRunStepErrorsResolver: FlowRunEndingResolver<
  FlowRunStepError[]
> = async (flowRun, _args, context) =>
  (await getFlowRunEnding(flowRun, context))?.runFinished.stepErrors ?? null;
