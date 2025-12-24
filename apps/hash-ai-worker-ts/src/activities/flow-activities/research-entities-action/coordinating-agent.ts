import type {
  EntityUuid,
  OriginProvenance,
  Url,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import {
  getSimplifiedAiFlowActionInputs,
  type OutputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity.js";
import { logger } from "../../shared/activity-logger.js";
import {
  areUrlsTheSameAfterNormalization,
  getFlowContext,
  getProvidedFiles,
} from "../../shared/get-flow-context.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { logProgress } from "../../shared/log-progress.js";
import { mapActionInputEntitiesToEntities } from "../../shared/map-action-input-entities-to-entities.js";
import { stringify } from "../../shared/stringify.js";
import { createCheckpoint } from "./checkpoints.js";
import { createInitialPlan } from "./coordinating-agent/create-initial-plan.js";
import { processCompleteToolCall } from "./coordinating-agent/process-complete-tool-call.js";
import { requestCoordinatorActions } from "./coordinating-agent/request-coordinator-actions.js";
import type { ExistingEntitySummary } from "./coordinating-agent/summarize-existing-entities.js";
import { summarizeExistingEntities } from "./coordinating-agent/summarize-existing-entities.js";
import { updateStateFromInferredClaims } from "./coordinating-agent/update-state-from-inferred-claims.js";
import type {
  ParsedCoordinatorToolCall,
  ParsedCoordinatorToolCallMap,
} from "./shared/coordinator-tools.js";
import {
  getSomeToolCallResults,
  handleStopTasksRequests,
  nullReturns,
  triggerToolCallsRequests,
} from "./shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./shared/coordinators.js";
import { processCommonStateMutationsFromToolResults } from "./shared/coordinators.js";

/**
 * Takes the inputs to the coordinating agent, parses them, and:
 * 1. Fetches the full entity types for the entityTypeIds requested
 * 2. Generates summaries for any existing entities provided
 */
const parseAndResolveCoordinatorInputs = async (params: {
  stepInputs: StepInput[];
  testingParams?: {
    humanInputCanBeRequested?: boolean;
  };
}): Promise<CoordinatingAgentInput> => {
  const { stepInputs, testingParams } = params;

  const {
    prompt,
    entityTypeIds,
    existingEntities: inputExistingEntities,
    reportSpecification,
  } = getSimplifiedAiFlowActionInputs({
    inputs: stepInputs,
    actionType: "researchEntities",
  });

  const { userAuthentication } = await getFlowContext();

  /**
   * @todo: simplify the properties in the existing entities
   */
  const existingEntities = inputExistingEntities
    ? mapActionInputEntitiesToEntities({ inputEntities: inputExistingEntities })
    : undefined;

  let existingEntitySummaries: ExistingEntitySummary[] | undefined = undefined;

  if (existingEntities && existingEntities.length > 0) {
    existingEntitySummaries = (
      await summarizeExistingEntities({
        existingEntities,
      })
    ).existingEntitySummaries;
  }

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    graphApiClient,
    entityTypeIds: [
      ...entityTypeIds!,
      ...(existingEntities?.flatMap(({ metadata }) => metadata.entityTypeIds) ??
        []),
    ].filter((entityTypeId, index, all) => all.indexOf(entityTypeId) === index),
    actorId: userAuthentication.actorId,
  });

  const entityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && !isLink,
    )
    .map(({ schema }) => schema);

  const linkEntityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && isLink,
    )
    .map(({ schema }) => schema);

  return {
    humanInputCanBeRequested: testingParams?.humanInputCanBeRequested ?? true,
    prompt,
    reportSpecification,
    entityTypes,
    linkEntityTypes: linkEntityTypes.length > 0 ? linkEntityTypes : undefined,
    allDereferencedEntityTypesById: dereferencedEntityTypes,
    existingEntities,
    existingEntitySummaries,
  };
};

/**
 * This is the function that takes starting coordinating agent state and has the coordinator orchestrate the research
 * task.
 *
 * It outputs proposals for entities.
 *
 * Side effects:
 * 1. Any claims inferred during the process will be saved to the graph, in the web chosen for the overall flow run
 * 2. Any metered API usage incurred will be recorded
 */
export const runCoordinatingAgent: FlowActionActivity<{
  state: CoordinatingAgentState;
  testingParams?: {
    humanInputCanBeRequested?: boolean;
    persistState?: (state: CoordinatingAgentState) => void;
    resumeFromState?: CoordinatingAgentState;
  };
}> = async ({ inputs: stepInputs, state, testingParams }) => {
  const workerIdentifiers = state.coordinatorIdentifiers;

  const input = await parseAndResolveCoordinatorInputs({
    stepInputs,
    testingParams,
  });

  const { flowEntityId, stepId, webId } = await getFlowContext();

  const providedFileEntities = await getProvidedFiles();

  const providedFiles: CoordinatingAgentState["resourcesNotVisited"] =
    providedFileEntities.map((entity) => {
      const {
        fileUrl: unsignedUrl,
        description,
        displayName,
        fileName,
      } = simplifyProperties(entity.properties);

      return {
        url: unsignedUrl as Url,
        title: displayName ?? fileName ?? unsignedUrl.split("/").pop()!,
        summary: description ?? "",
        fromSearchQuery: "User-provided resource",
      };
    });

  if (!state.plan) {
    /**
     * If we don't already have a plan, this is the first run of the action
     */
    logProgress([
      {
        type: "StartedCoordinator",
        attempt: Context.current().info.attempt,
        input: {
          goal: input.prompt,
        },
        recordedAt: new Date().toISOString(),
        stepId,
        ...workerIdentifiers,
      },
    ]);

    /**
     * We start by asking the coordinator agent to create an initial plan
     * for the research task.
     */
    const { plan: initialPlan, questionsAndAnswers } = await createInitialPlan({
      input,
      providedFiles,
      questionsAndAnswers: null,
      state,
    });

    logProgress([
      {
        recordedAt: new Date().toISOString(),
        stepId: Context.current().info.activityId,
        type: "CreatedPlan",
        plan: initialPlan,
        ...workerIdentifiers,
      },
    ]);

    /* eslint-disable no-param-reassign */
    state.plan = initialPlan;
    state.questionsAndAnswers = questionsAndAnswers;
    /* eslint-enable no-param-reassign */

    /**
     * If we've been given a function to persist the state somewhere (e.g. a file), we do so now.
     */
    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    await createCheckpoint({ state });
  }

  /**
   * Ask the coordinator what it wants to do next given the task inputs and current state.
   */
  const { toolCalls: initialToolCalls } = await requestCoordinatorActions({
    input,
    state,
  });

  /**
   * The recursive function that processes tool calls from the coordinator until a successful 'complete' call is made.
   */
  const processToolCalls = async (params: {
    toolCalls: ParsedCoordinatorToolCall[];
  }) => {
    const { toolCalls } = params;

    const isTerminated = toolCalls.some(
      (toolCall) => toolCall.name === "terminate",
    );

    if (isTerminated) {
      return;
    }

    await handleStopTasksRequests({ toolCalls });

    const requestMakingToolCalls = toolCalls.filter(
      (toolCall) =>
        toolCall.name !== "terminate" &&
        toolCall.name !== "complete" &&
        toolCall.name !== "stopTasks" &&
        toolCall.name !== "waitForOutstandingTasks",
    );

    const completeToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "complete",
    );

    const waitForTasksToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "waitForOutstandingTasks",
    );

    if (waitForTasksToolCall && !requestMakingToolCalls.length) {
      /**
       * If the coordinator has decided to wait for outstanding tasks, notify the user of this.
       *
       * We don't do this if the coordinator has _also_ started other work.
       * It doesn't need to call 'waitForOutstandingTasks' if it's starting other tasks, but it also doesn't do any
       * harm.
       * 'waitForOutstandingTasks' is just a mechanism to allow it to respond without choosing to do anything else.
       */
      logProgress([
        {
          stepId,
          recordedAt: new Date().toISOString(),
          type: "CoordinatorWaitsForTasks",
          explanation: waitForTasksToolCall.input.explanation,
          ...workerIdentifiers,
        },
      ]);
    }

    if (
      completeToolCall &&
      state.outstandingTasks.length > 0 &&
      !requestMakingToolCalls.length
    ) {
      /**
       * If the coordinator has called complete but there are still outstanding tasks,
       * we let them wrap up so that any claims and entities they've proposed to date are captured.
       * Otherwise, we'll have 'orphaned' claims which have been created but not attached to any entity.
       */
      const stopTasksToolCall = {
        id: generateUuid(),
        name: "stopTasks",
        input: {
          tasksToStop: state.outstandingTasks.map((task) => ({
            toolCallId: task.toolCall.id,
            explanation: "Coordinator decided to complete the research task",
          })),
        },
      } satisfies ParsedCoordinatorToolCallMap["stopTasks"];

      await handleStopTasksRequests({ toolCalls: [stopTasksToolCall] });
    } else if (requestMakingToolCalls.length) {
      state.outstandingTasks.push(
        ...triggerToolCallsRequests({
          agentType: "coordinator",
          input,
          state,
          toolCalls: requestMakingToolCalls,
          workerIdentifiers,
        }),
      );
    }

    const toolCallResults = await getSomeToolCallResults({
      state,
      /**
       * If the worker has called 'complete', we will have issued stop requests to all outstanding tasks.
       * We wait for them to have finished cleaning up so we can capture whatever they had inferred to this point.
       */
      waitForAll: !!completeToolCall,
    });

    processCommonStateMutationsFromToolResults({
      toolCallResults,
      state,
    });

    const updatedPlan = toolCallResults.find(
      (call) => !!call.updatedPlan,
    )?.updatedPlan;

    if (updatedPlan) {
      // eslint-disable-next-line no-param-reassign
      state.plan = updatedPlan;

      logProgress([
        {
          type: "UpdatedPlan",
          plan: updatedPlan,
          stepId,
          recordedAt: new Date().toISOString(),
          ...workerIdentifiers,
        },
      ]);
    }

    state.delegatedTasksCompleted.push(
      ...toolCallResults.flatMap(
        ({ delegatedTasksCompleted }) => delegatedTasksCompleted ?? [],
      ),
    );

    state.suggestionsForNextStepsMade.push(
      ...toolCallResults.flatMap(
        ({ suggestionsForNextStepsMade }) => suggestionsForNextStepsMade ?? [],
      ),
    );

    const newEntitySummaries = toolCallResults.flatMap(
      ({ entitySummaries }) => entitySummaries ?? [],
    );
    const newClaims = toolCallResults.flatMap(
      ({ inferredClaims }) => inferredClaims ?? [],
    );

    /**
     * Update the state with the new claims and entity summaries inferred from the tool calls,
     * which includes the deduplication of entities and the conversion of claims into proposed entities.
     */
    await updateStateFromInferredClaims({
      input,
      state,
      newClaims,
      newEntitySummaries,
      workerIdentifiers,
    });

    /**
     * Check whether the research task has completed after processing the other tool calls,
     * in case the agent has made other tool calls at the same time as the "complete" tool call.
     */
    if (completeToolCall) {
      /**
       * This will return an error if there are issues we need to ask the coordinator about before completing the task.
       */
      const completeToolCallResult = processCompleteToolCall({
        input,
        state,
        toolCall: completeToolCall,
      });

      toolCallResults.push({
        ...nullReturns,
        ...completeToolCallResult,
      });

      if (!completeToolCallResult.isError) {
        /**
         * Either there are no issues, or there were issues which we've already asked the coordinator about and it's
         * chosen to ignore.
         */
        await createCheckpoint({ state });
        return;
      }

      /**
       * If we have discovered issues, we need to ask the coordinator about them before completing the task.
       * We mark the check step has completed so that it can choose to call 'complete' again anyway.
       */
      // eslint-disable-next-line no-param-reassign
      state.hasConductedCompleteCheckStep = true;
    } else {
      /**
       * If we don't have a 'complete' tool call, reset the check step state in case of the following sequence of
       * events:
       * 1. The coordinator makes a 'complete' call
       * 2. We identify an issue which we ask the coordinator about
       * 3. It decides to do more work rather than immediately call 'complete' again to ignore the issues identified
       *
       * When it later calls 'complete', we want to run the check step again, as there may be different issues.
       */
      // eslint-disable-next-line no-param-reassign
      state.hasConductedCompleteCheckStep = false;
    }

    // eslint-disable-next-line no-param-reassign
    state.lastCompletedToolCalls = toolCallResults;

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    await createCheckpoint({ state });

    const { toolCalls: nextToolCalls } = await requestCoordinatorActions({
      input,
      state,
    });

    await processToolCalls({
      toolCalls: nextToolCalls,
    });
  };

  await processToolCalls({
    toolCalls: initialToolCalls,
  });

  /**
   * These are entities the coordinator has chosen to highlight as the result of research,
   * but we want to output all entity proposals from the task.
   */
  const submittedEntities = state.proposedEntities.filter(({ localEntityId }) =>
    state.submittedEntityIds.includes(localEntityId),
  );

  logger.debug(`Submitted ${submittedEntities.length} entities`);

  const allProposedEntities = state.proposedEntities;

  const filesUsedToProposeEntities = allProposedEntities
    .flatMap((proposedEntity) => {
      const sourcesUsedToProposeEntity = [
        ...(proposedEntity.provenance.sources ?? []),
        ...flattenPropertyMetadata(proposedEntity.propertyMetadata).flatMap(
          ({ metadata }) => metadata.provenance?.sources ?? [],
        ),
      ];

      return sourcesUsedToProposeEntity.flatMap((source) => {
        if (
          source.location?.uri &&
          source.type === "document" &&
          /**
           * Exclude files we already have an entity for
           */
          !providedFileEntities.some((fileEntity) =>
            areUrlsTheSameAfterNormalization(
              fileEntity.properties[
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
              ],
              source.location!.uri!,
            ),
          )
        ) {
          return {
            url: source.location.uri,
            entityTypeId: systemEntityTypes.pdfDocument.entityTypeId,
          };
        }

        return [];
      });
    })
    .filter(
      ({ url }, index, all) =>
        all.findIndex((file) => file.url === url) === index,
    );

  const fileEditionProvenance: ProposedEntity["provenance"] = {
    actorType: "ai",
    origin: {
      type: "flow",
      id: flowEntityId,
      stepIds: [stepId],
    } satisfies OriginProvenance,
  };

  /**
   * We return additional proposed entities for each file that was used to propose
   * the submitted entities, so that these are persisted in the graph.
   *
   * Note that uploading the file is handled in the "Persist Entity" action.
   */
  const fileEntityProposals: ProposedEntity[] = filesUsedToProposeEntities.map(
    ({ url, entityTypeId }) => ({
      claims: {
        isObjectOf: [],
        isSubjectOf: [],
      },
      /**
       * @todo: H-2728 set the web page this file was discovered in (if applicable) in the property provenance
       * for the `fileUrl`
       */
      propertyMetadata: { value: {} },
      provenance: fileEditionProvenance,
      entityTypeIds: [entityTypeId],
      localEntityId: entityIdFromComponents(
        webId,
        generateUuid() as EntityUuid,
      ),
      properties: {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
          url,
      } satisfies FileProperties,
    }),
  );

  const now = new Date().toISOString();

  logProgress(
    fileEntityProposals.map((proposedFileEntity) => ({
      type: "ProposedEntity",
      isUpdateToExistingProposal: false,
      proposedEntity: proposedFileEntity,
      recordedAt: now,
      stepId,
      ...workerIdentifiers,
    })),
  );

  logger.debug(`Proposed Entities: ${stringify(allProposedEntities)}`);
  logger.debug(`File Entities Proposed: ${stringify(fileEntityProposals)}`);

  logProgress([
    {
      type: "ClosedCoordinator",
      output: {
        entityCount: allProposedEntities.length + fileEntityProposals.length,
      },
      recordedAt: new Date().toISOString(),
      stepId,
      ...workerIdentifiers,
    },
  ]);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" satisfies OutputNameForAiFlowAction<"researchEntities">,
            payload: {
              kind: "ProposedEntity",
              value: [...allProposedEntities, ...fileEntityProposals],
            },
          },
          {
            outputName:
              "highlightedEntities" satisfies OutputNameForAiFlowAction<"researchEntities">,
            payload: {
              kind: "EntityId",
              value: submittedEntities.map(
                ({ localEntityId }) => localEntityId,
              ),
            },
          },
        ],
      },
    ],
  };
};
