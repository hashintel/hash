import { ActivityCancellationType } from "@temporalio/workflow";
import { describe, expect, it } from "vitest";

import {
  actionDefinitions,
  aiActionDefinitions,
  integrationActionDefinitions,
} from "@local/hash-isomorphic-utils/flows/action-definitions";

import { getActionActivityOptions } from "./action-activity-options.js";

import type { FlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/types";

describe("getActionActivityOptions", () => {
  it("runs each action on the task queue of the worker that implements it", () => {
    for (const [actionDefinitionId, taskQueue] of [
      ...Object.keys(aiActionDefinitions).map((id) => [id, "ai"] as const),
      ...Object.keys(integrationActionDefinitions).map(
        (id) => [id, "integration"] as const,
      ),
    ]) {
      expect(
        getActionActivityOptions(actionDefinitionId as FlowActionDefinitionId)
          .taskQueue,
        actionDefinitionId,
      ).toBe(taskQueue);
    }
  });

  it("sets a heartbeat timeout only for an action that heartbeats, and waits for one that handles cancellation", () => {
    for (const actionDefinitionId of Object.keys(
      actionDefinitions,
    ) as FlowActionDefinitionId[]) {
      const { heartbeatTimeoutSeconds, handlesCancellation } =
        actionDefinitions[actionDefinitionId].activity;
      const options = getActionActivityOptions(actionDefinitionId);

      expect(options.heartbeatTimeout, actionDefinitionId).toBe(
        heartbeatTimeoutSeconds === undefined
          ? undefined
          : `${heartbeatTimeoutSeconds} second`,
      );
      expect(options.cancellationType, actionDefinitionId).toBe(
        handlesCancellation
          ? ActivityCancellationType.WAIT_CANCELLATION_COMPLETED
          : ActivityCancellationType.ABANDON,
      );
    }
  });
});
