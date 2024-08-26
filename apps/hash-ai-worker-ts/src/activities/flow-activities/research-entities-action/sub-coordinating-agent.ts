import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";

import { isActivityCancelled } from "../../shared/get-flow-context.js";
import type { LocalEntitySummary } from "../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../shared/infer-summaries-then-claims-from-text/types.js";
import { getToolCallResults } from "./shared/coordinator-tools.js";
import { processCommonStateMutationsFromToolResults } from "./shared/coordinators.js";
import type { DuplicateReport } from "./shared/deduplicate-entities.js";
import { deduplicateEntities } from "./shared/deduplicate-entities.js";
import { createInitialPlan } from "./sub-coordinating-agent/create-initial-plan.js";
import type { SubCoordinatingAgentInput } from "./sub-coordinating-agent/input.js";
import { requestSubCoordinatorActions } from "./sub-coordinating-agent/request-sub-coordinator-actions.js";
import type { SubCoordinatingAgentState } from "./sub-coordinating-agent/state.js";
import type { ParsedSubCoordinatorToolCall } from "./sub-coordinating-agent/sub-coordinator-tools.js";

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

  let state: SubCoordinatingAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input });

    state = {
      plan: initialPlan,
      inferredClaims: [],
      entitySummaries: [],
      outstandingToolCalls: [],
      previousCalls: [],
      webQueriesMade: [],
      resourcesNotVisited: [],
      resourceUrlsVisited: [],
    };
  }

  const { toolCalls: initialToolCalls } = await requestSubCoordinatorActions({
    input,
    state,
  });

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

    const toolCallsWithNoComplete = toolCalls.filter(
      (toolCall) =>
        toolCall.name !== "complete" && toolCall.name !== "terminate",
    );

    const completedToolCalls = await getToolCallResults({
      agentType: "sub-coordinator",
      input,
      state,
      toolCalls: toolCallsWithNoComplete,
      workerIdentifiers,
    });

    if (isActivityCancelled()) {
      return {
        status: "terminated",
        explanation: "Activity was cancelled",
      };
    }

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
