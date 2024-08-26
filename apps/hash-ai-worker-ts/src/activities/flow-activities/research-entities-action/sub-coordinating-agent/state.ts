import type { CompletedCoordinatorToolCall } from "../shared/coordinator-tools.js";
import type { CoordinatingAgentState } from "../shared/coordinators.js";
import type {
  ParsedSubCoordinatorToolCall,
  SubCoordinatingAgentToolName,
} from "./sub-coordinator-tools.js";

export type SubCoordinatingAgentState = Pick<
  CoordinatingAgentState,
  | "plan"
  | "entitySummaries"
  | "inferredClaims"
  | "resourcesNotVisited"
  | "resourceUrlsVisited"
  | "webQueriesMade"
> & {
  outstandingToolCalls: ParsedSubCoordinatorToolCall[];
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>[];
  }[];
};
