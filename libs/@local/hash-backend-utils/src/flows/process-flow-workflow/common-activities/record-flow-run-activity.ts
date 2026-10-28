import { Context } from "@temporalio/activity";

import { createTemporalClient } from "../../../temporal.js";
import { getStorageProvider } from "../../payload-storage.js";
import { recordEndedFlowRun } from "../../run-record.js";
import { getFlowRunEntityByWorkflowId } from "../../shared/get-flow-run-entity-by-workflow-id.js";
import {
  getFlowRunStatusFieldsFromRecordHeader,
  saveFlowRunStatus,
} from "../../shared/save-flow-run-status.js";

import type { TemporalClient } from "../../../temporal.js";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowRunEnding } from "@local/hash-isomorphic-utils/flows/temporal-types";

export type RecordFlowRunActivityParams = {
  ending: FlowRunEnding;
  userAuthentication: { actorId: ActorEntityUuid };
};

let temporalClient: TemporalClient | undefined;

/** Writes the record of the calling workflow's run, which is about to end as `ending`, and saves its status. */
export const recordFlowRunActivity = async ({
  ending,
  graphApiClient,
  userAuthentication,
}: RecordFlowRunActivityParams & {
  graphApiClient: GraphApi;
}): Promise<void> => {
  const { workflowExecution } = Context.current().info;

  if (!workflowExecution) {
    throw new Error("recordFlowRunActivity was called outside a workflow");
  }

  const { workflowId, runId } = workflowExecution;

  temporalClient ??= await createTemporalClient();

  const record = await recordEndedFlowRun({
    temporalClient,
    storageProvider: getStorageProvider(),
    workflowId,
    runId,
    ending,
  });

  if (!record) {
    return;
  }

  const flowRunEntity = await getFlowRunEntityByWorkflowId({
    graphApiClient,
    temporalWorkflowId: workflowId,
    userAuthentication,
  });

  /* A run that failed before its first persist has no entity. */
  if (flowRunEntity) {
    await saveFlowRunStatus({
      fields: getFlowRunStatusFieldsFromRecordHeader(record.header),
      flowRunEntity,
      graphApiClient,
      userAuthentication,
    });
  }
};
