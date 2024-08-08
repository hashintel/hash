import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { Context } from "@temporalio/activity";
import type { Client as TemporalClient } from "@temporalio/client/lib/client.js";

import { checkpointSignal } from "../../../shared/signals.js";
import type { CoordinatingAgentState } from "./coordinating-agent.js";

export type ResearchActionCheckpoint = {
  state?: CoordinatingAgentState;
};

let temporalClient: TemporalClient | undefined;

export const createCheckpoint = async (
  checkpointData: ResearchActionCheckpoint,
) => {
  Context.current().heartbeat(checkpointData);

  const workflowId = Context.current().info.workflowExecution.workflowId;

  temporalClient = temporalClient ?? (await createTemporalClient());

  const handle = temporalClient.workflow.getHandle(workflowId);

  await handle.signal(checkpointSignal, {});
};

export const getLastCheckpoint = () => {
  return Context.current().info.heartbeatDetails as
    | ResearchActionCheckpoint
    | undefined;
};
