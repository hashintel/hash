import { temporalNamespace } from "../../temporal.js";

import type {
  Client as TemporalClient,
  WorkflowExecutionDescription,
} from "@temporalio/client";
import type proto from "@temporalio/proto";

export type FlowRunHistory = {
  workflow: WorkflowExecutionDescription;
  history: proto.temporal.api.history.v1.IHistoryEvent[];
};

/**
 * Histories being read or already read, by workflow id, so the fields of one GraphQL request read each run's history
 * once. Create one per request: a history goes stale as the run goes on.
 */
export type FlowRunHistoriesByWorkflowId = Map<string, Promise<FlowRunHistory>>;

const readFlowRunHistory = async ({
  temporalClient,
  workflowId,
}: {
  temporalClient: TemporalClient;
  workflowId: string;
}): Promise<FlowRunHistory> => {
  const workflow = await temporalClient.workflow
    .getHandle(workflowId)
    .describe();

  /**
   * we need to paginate manually because the event history size can be larger than the 4MB gRPC message limit,
   * which is not configurable in Temporal.
   * @see https://github.com/temporalio/sdk-typescript/issues/1469
   */
  let nextPageToken: Uint8Array | undefined;
  const history: proto.temporal.api.history.v1.IHistoryEvent[] = [];
  do {
    const response =
      await temporalClient.workflowService.getWorkflowExecutionHistory({
        execution: {
          workflowId,
          runId: workflow.runId,
        },
        maximumPageSize: 100,
        namespace: temporalNamespace,
        nextPageToken,
      });

    nextPageToken = response.nextPageToken;

    history.push(...(response.history?.events ?? []));

    /**
     * nextPageToken should be null if there are no more pages, but it's actually an empty Array
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } while (nextPageToken?.length);

  return { workflow, history };
};

/**
 * The current run of a flow's workflow, and its whole history. The history is read by run id, so a reset while it's
 * read can't mix the events of two runs. With `historiesByWorkflowId`, a history already read there is reused.
 */
export const getFlowRunHistory = ({
  temporalClient,
  workflowId,
  historiesByWorkflowId,
}: {
  temporalClient: TemporalClient;
  workflowId: string;
  historiesByWorkflowId?: FlowRunHistoriesByWorkflowId;
}): Promise<FlowRunHistory> => {
  const existingHistory = historiesByWorkflowId?.get(workflowId);

  if (existingHistory) {
    return existingHistory;
  }

  const flowRunHistory = readFlowRunHistory({ temporalClient, workflowId });

  historiesByWorkflowId?.set(workflowId, flowRunHistory);

  return flowRunHistory;
};
