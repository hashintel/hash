import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { getFlowRunRecord } from "@local/hash-backend-utils/flows/run-record";

import * as Error from "../../../error";

import type { FlowRun } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

type FlowRunParent = FlowRun | SparseFlowRun;

/** So that a run's field resolvers look up its entity once between them. */
const recordsByFlowRun = new WeakMap<FlowRunParent, Promise<FlowRunRecord>>();

/** The record of the run a `FlowRun` field resolver is resolving. */
export const getRecordOfFlowRun = (
  flowRun: FlowRunParent,
  context: Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunRecords" | "temporal"
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

    return getFlowRunRecord({
      recordsByWorkflowId: context.flowRunRecords,
      storageProvider: context.dataSources.uploadProvider,
      temporalClient: context.temporal,
      workflowId:
        flowRunEntity.properties[
          "https://hash.ai/@h/types/property-type/workflow-id/"
        ],
    });
  })();

  recordsByFlowRun.set(flowRun, record);

  return record;
};
