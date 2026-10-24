import { describe, expect, it } from "vitest";

import {
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
});
