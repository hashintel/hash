import type {
  CompletedCoordinatorToolCall,
  ParsedSubCoordinatorToolCall,
  SubCoordinatingAgentToolName,
} from "../shared/coordinator-tools.js";
import type {
  CoordinatingAgentState,
  OutstandingCoordinatorTask,
} from "../shared/coordinators.js";

export type SubCoordinatingAgentState = Pick<
  CoordinatingAgentState,
  | "plan"
  | "entitySummaries"
  | "inferredClaims"
  | "resourcesNotVisited"
  | "resourceUrlsVisited"
  | "webQueriesMade"
  | "workersStarted"
  | "lastCompletedToolCalls"
> & {
  outstandingTasks: OutstandingCoordinatorTask<ParsedSubCoordinatorToolCall>[];
  lastCompletedToolCalls: CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>[];
};
