import type { CompletedCoordinatorToolCall } from "../shared/coordinator-tools.js";
import type { CoordinatingAgentState } from "../shared/coordinators.js";

import { SubCoordinatingAgentToolName } from "./sub-coordinator-tools.js";

export type SubCoordinatingAgentState = Pick<
  CoordinatingAgentState,
  | "plan"
  | "entitySummaries"
  | "inferredClaims"
  | "resourcesNotVisited"
  | "resourceUrlsVisited"
  | "webQueriesMade"
> & {
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>[];
  }[];
};
