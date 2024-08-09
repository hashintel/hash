import { Context } from "@temporalio/activity";

import { logProgress } from "../../shared/log-progress.js";
import type { CoordinatingAgentState } from "./coordinating-agent.js";

export type ResearchActionCheckpoint = {
  state?: CoordinatingAgentState;
};

export const createCheckpoint = (checkpointData: ResearchActionCheckpoint) => {
  Context.current().heartbeat(checkpointData);

  logProgress([
    {
      type: "Checkpoint",
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
    },
  ]);
};

export const getLastCheckpoint = () => {
  return Context.current().info.heartbeatDetails as
    | ResearchActionCheckpoint
    | undefined;
};
