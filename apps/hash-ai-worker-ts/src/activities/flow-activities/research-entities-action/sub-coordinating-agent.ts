import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";

import { logProgress } from "../../shared/log-progress.js";
import type { Claim } from "../shared/claims.js";
import type { LocalEntitySummary } from "../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import { checkIfWorkerShouldStop } from "./shared/check-if-worker-should-stop.js";
import {
  getSomeToolCallResults,
  handleStopTasksRequests,
  type ParsedSubCoordinatorToolCall,
  triggerToolCallsRequests,
} from "./shared/coordinator-tools.js";
import {
  processCommonStateMutationsFromToolResults,
  stopWorkers,
} from "./shared/coordinators.js";
import { deduplicateClaims } from "./shared/deduplicate-claims.js";
import type { DuplicateReport } from "./shared/deduplicate-entities.js";
import { deduplicateEntities } from "./shared/deduplicate-entities.js";
import { createInitialPlan } from "./sub-coordinating-agent/create-initial-plan.js";
import type { SubCoordinatingAgentInput } from "./sub-coordinating-agent/input.js";
import { requestSubCoordinatorActions } from "./sub-coordinating-agent/request-sub-coordinator-actions.js";
import type { SubCoordinatingAgentState } from "./sub-coordinating-agent/state.js";

const handleStopReturn = async (
  shouldStopStatus: {
    explanation: string;
    shouldStop: true;
    stopType: string;
  },
  childWorkers: SubCoordinatingAgentState["workersStarted"],
  workerIdentifiers: WorkerIdentifiers,
) => {
  if (childWorkers.length) {
    /**
     * Also send a signal to stop any link explorer tasks that the sub-coordinator has started, so that they stop early.
     */
    await stopWorkers(
      childWorkers.map((worker) => ({
        explanation: "Parent worker was stopped.",
        toolCallId: worker.toolCallId,
      })),
    );
  }

  /**
   * If the activity has been cancelled because the workflow was terminated, this log will have no receiver and won't be picked up.
   * It will be picked up in cases where the workflow continues (e.g. when only this task has been requested to stop).
   */
  logProgress([
    {
      explanation: shouldStopStatus.explanation,
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "WorkerWasStopped",
      ...workerIdentifiers,
    },
  ]);

  if (shouldStopStatus.stopType === "activityCancelled") {
    return {
      status: "terminated",
      explanation: "Activity was cancelled",
    } as const;
  }

  return {
    status: "ok",
    explanation: "Early stopping requested",
  } as const;
};

/**
 * An agent which has a subset of the functionality of the coordinating agent.
 *
 * Designed to allow the coordinating agent to delegate tasks to it.
 *
 * It can make web searches and explore links, but it CANNOT:
 * 1. Create other sub-coordinators
 * 2. Request human input
 *
 * In contrast to the coordinator, the sub-coordinator sees all claims inferred in the course of its work.
 * The coordinator only sees the entities proposed from claims, to reduce the risk of the context window being exceeded.
 */
export const runSubCoordinatingAgent = async (params: {
  input: SubCoordinatingAgentInput;
  testingParams?: {
    persistState: (state: SubCoordinatingAgentState) => void;
    resumeFromState?: SubCoordinatingAgentState;
  };
  workerIdentifiers: WorkerIdentifiers;
}): Promise<
  | {
      status: "ok";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
  | {
      status: "terminated";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
> => {
  const { testingParams, input, workerIdentifiers } = params;

  let state: SubCoordinatingAgentState = {
    plan: "",
    inferredClaims: [],
    entitySummaries: [],
    outstandingTasks: [],
    previousCalls: [],
    webQueriesMade: [],
    resourcesNotVisited: [],
    resourceUrlsVisited: [],
    workersStarted: [],
  };

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input, state });

    state.plan = initialPlan;
  }

  /**
   * Given the original input and starting state, ask the sub-coordinator what to do first.
   */
  const { toolCalls: initialToolCalls } = await requestSubCoordinatorActions({
    input,
    state,
  });

  /**
   * The recursive function that will repeatedly ask the coordinator what to do next, until it calls 'terminate' or 'complete'.
   */
  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ParsedSubCoordinatorToolCall[];
  }): Promise<
    | {
        status: "ok";
        explanation: string;
      }
    | {
        status: "terminated";
        explanation: string;
      }
  > => {
    const { toolCalls } = processToolCallsParams;

    const terminateToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "terminate",
    );

    if (terminateToolCall) {
      const { explanation } = terminateToolCall.input;

      return { status: "terminated", explanation };
    }

    await handleStopTasksRequests({ toolCalls, state });

    const requestMakingToolCalls = toolCalls.filter(
      (toolCall) =>
        toolCall.name !== "terminate" &&
        toolCall.name !== "complete" &&
        toolCall.name !== "stopTasks" &&
        toolCall.name !== "waitForOutstandingTasks",
    );

    state.outstandingTasks.push(
      ...triggerToolCallsRequests({
        agentType: "sub-coordinator",
        input,
        state,
        toolCalls: requestMakingToolCalls,
        workerIdentifiers,
      }),
    );

    /**
     * Prior to initiating more requests based on the agent's tool calls, check if we should stop.
     */
    const preRequestToolResultsStopCheck =
      await checkIfWorkerShouldStop(workerIdentifiers);
    if (preRequestToolResultsStopCheck.shouldStop) {
      return handleStopReturn(
        preRequestToolResultsStopCheck,
        state.workersStarted,
        workerIdentifiers,
      );
    }

    const completedToolCalls = await getSomeToolCallResults({
      state,
    });

    const completeToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "complete",
    );

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    processCommonStateMutationsFromToolResults({
      toolCallResults: completedToolCalls,
      state,
    });

    const updatedPlan = completedToolCalls.find(
      (call) => !!call.updatedPlan,
    )?.updatedPlan;

    if (updatedPlan) {
      state.plan = updatedPlan;
    }

    const newEntitySummaries = completedToolCalls.flatMap(
      ({ entitySummaries }) => entitySummaries ?? [],
    );
    const newClaims = completedToolCalls.flatMap(
      ({ inferredClaims }) => inferredClaims ?? [],
    );

    state.inferredClaims = [...state.inferredClaims, ...newClaims];

    if (newEntitySummaries.length > 0) {
      const { duplicates } = await deduplicateEntities({
        entities: [
          ...input.relevantEntities,
          ...newEntitySummaries,
          ...state.entitySummaries,
        ],
      });

      const existingEntityIds = input.relevantEntities.map(
        ({ localId }) => localId,
      );

      const adjustedDuplicates = duplicates.map<DuplicateReport>(
        ({ canonicalId, duplicateIds }) => {
          if (existingEntityIds.includes(canonicalId)) {
            return { canonicalId, duplicateIds };
          }

          const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
            existingEntityIds.includes(id),
          );

          /**
           * @todo: this doesn't account for when there are duplicates
           * detected in the input relevant entities.
           */
          if (existingEntityIdMarkedAsDuplicate) {
            return {
              canonicalId: existingEntityIdMarkedAsDuplicate,
              duplicateIds: [
                ...duplicateIds.filter(
                  (id) => id !== existingEntityIdMarkedAsDuplicate,
                ),
                canonicalId,
              ],
            };
          }

          return { canonicalId, duplicateIds };
        },
      );

      const inferredClaimsWithDeduplicatedEntities = state.inferredClaims.map(
        (claim) => {
          const { subjectEntityLocalId, objectEntityLocalId } = claim;
          const subjectDuplicate = adjustedDuplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(subjectEntityLocalId),
          );

          const objectDuplicate = objectEntityLocalId
            ? duplicates.find(({ duplicateIds }) =>
                duplicateIds.includes(objectEntityLocalId),
              )
            : undefined;

          return {
            ...claim,
            subjectEntityLocalId:
              subjectDuplicate?.canonicalId ?? claim.subjectEntityLocalId,
            objectEntityLocalId:
              objectDuplicate?.canonicalId ?? objectEntityLocalId,
          };
        },
      );

      state.inferredClaims.push(...inferredClaimsWithDeduplicatedEntities);

      state.inferredClaims = await deduplicateClaims(state.inferredClaims);

      state.entitySummaries = [
        ...state.entitySummaries,
        ...newEntitySummaries,
      ].filter(
        ({ localId }) =>
          !duplicates.some(({ duplicateIds }) =>
            duplicateIds.includes(localId),
          ),
      );
    }

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    if (completeToolCall) {
      const { explanation } = completeToolCall.input;

      return { status: "ok", explanation };
    }

    /**
     * Prior to asking the coordinator to decide on its next actions, check if we should stop.
     */
    const preRequestNextActionsShouldStop =
      await checkIfWorkerShouldStop(workerIdentifiers);
    if (preRequestNextActionsShouldStop.shouldStop) {
      return handleStopReturn(
        preRequestNextActionsShouldStop,
        state.workersStarted,
        workerIdentifiers,
      );
    }

    const { toolCalls: nextToolCalls } = await requestSubCoordinatorActions({
      input,
      state,
    });

    return processToolCalls({ toolCalls: nextToolCalls });
  };

  const result = await processToolCalls({ toolCalls: initialToolCalls });

  return {
    ...result,
    discoveredEntities: state.entitySummaries,
    discoveredClaims: state.inferredClaims,
  };
};
