import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { getFlowRunRecord } from "@local/hash-backend-utils/flows/run-record";
import { correctFlowRunStatusFromRecord } from "@local/hash-backend-utils/flows/shared/save-flow-run-status";

import * as Error from "../../../error";

import type { FlowRunSummary } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";

/** A run as `getFlowRunById` and `getFlowRuns` give it to its field resolvers: what its entity says about it. */
export type FlowRunParent = Omit<FlowRunSummary, "__typename">;

/** So that a run's field resolvers look up its entity once between them. */
const recordsByFlowRun = new WeakMap<FlowRunParent, Promise<FlowRunRecord>>();

/** A run's record, which also corrects the status its entity holds if it's out of date. */
export const getRecordOfFlowRun = (
  flowRun: FlowRunParent,
  context: Pick<
    GraphQLContext,
    | "authentication"
    | "dataSources"
    | "flowRunRecords"
    | "runningFlowRunHistories"
    | "temporal"
  >,
): Promise<FlowRunRecord> => {
  const existingRecord = recordsByFlowRun.get(flowRun);

  if (existingRecord) {
    return existingRecord;
  }

  const record = (async () => {
    const flowRunEntity = await getFlowRunEntityById({
      flowRunEntityId: flowRun.flowRunEntityId,
      graphApiClient: context.dataSources.graphApi,
      userAuthentication: context.authentication,
    });

    if (!flowRunEntity) {
      throw Error.notFound(
        `Flow run with id ${flowRun.flowRunEntityId} not found`,
      );
    }

    const flowRunRecord = await getFlowRunRecord({
      recordsByWorkflowId: context.flowRunRecords,
      runningHistories: context.runningFlowRunHistories,
      storageProvider: context.dataSources.uploadProvider,
      temporalClient: context.temporal,
      workflowId:
        flowRunEntity.properties[
          "https://hash.ai/@h/types/property-type/workflow-id/"
        ],
    });

    await correctFlowRunStatusFromRecord({
      flowRunEntity,
      graphApiClient: context.dataSources.graphApi,
      header: flowRunRecord.header,
      userAuthentication: context.authentication,
    });

    return flowRunRecord;
  })();

  recordsByFlowRun.set(flowRun, record);

  return record;
};
