import { Context } from "@temporalio/activity";

import { createTemporalClient } from "../../../temporal.js";
import { getStorageProvider } from "../../payload-storage.js";
import { recordEndedFlowRun } from "../../run-record.js";

import type { TemporalClient } from "../../../temporal.js";
import type { RecordedFlowRunEnding } from "@local/hash-isomorphic-utils/flows/temporal-types";

export type RecordFlowRunActivityParams = {
  ending: RecordedFlowRunEnding;
};

let temporalClient: TemporalClient | undefined;

/** Writes the record of the calling workflow's run, which is about to end as `ending`. */
export const recordFlowRunActivity = async ({
  ending,
}: RecordFlowRunActivityParams): Promise<void> => {
  const { workflowExecution } = Context.current().info;

  if (!workflowExecution) {
    throw new Error("recordFlowRunActivity was called outside a workflow");
  }

  const { workflowId, runId } = workflowExecution;

  temporalClient ??= await createTemporalClient();

  await recordEndedFlowRun({
    temporalClient,
    storageProvider: getStorageProvider(),
    workflowId,
    runId,
    ending,
  });
};
