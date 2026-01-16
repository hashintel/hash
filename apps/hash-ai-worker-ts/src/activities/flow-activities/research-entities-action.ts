import type {
  OriginProvenance,
  ProvidedEntityEditionProvenance,
} from "@blockprotocol/type-system";
import type { AiFlowActionActivity } from "@local/hash-backend-utils/flows";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import {
  getCheckpoint,
  heartbeatAndWaitCancellation,
} from "./research-entities-action/checkpoints.js";
import { runCoordinatingAgent } from "./research-entities-action/coordinating-agent.js";
import type { CoordinatingAgentState } from "./research-entities-action/shared/coordinators.js";

/**
 * An action to research entities of requested types according to the user's research goal.
 *
 * It outputs either the return of the coordinating agent (proposed entities), or nothing if it is cancelled.
 *
 * Even if the action is cancelled, it will have saved any claims discovered in the graph, and recorded LLM usage.
 * If the action is retried after a cancellation/error, it will archive any claims discovered in previous attempts,
 * unless (a) the action was reset to a specific time, and (b) the claims were created prior to this time.
 * LLM usage is never archived.
 */
export const researchEntitiesAction: AiFlowActionActivity<
  "researchEntities",
  {
    testingParams?: {
      humanInputCanBeRequested?: boolean;
      persistState?: (state: CoordinatingAgentState) => void;
      resumeFromState?: CoordinatingAgentState;
    };
  }
> = async (params) => {
  const stateAtResetCheckpoint = await getCheckpoint();

  const state: CoordinatingAgentState = params.testingParams?.resumeFromState ??
    stateAtResetCheckpoint?.state ?? {
      coordinatorIdentifiers: {
        workerType: "Coordinator",
        workerInstanceId: generateUuid(),
        parentInstanceId: null,
        toolCallId: null,
      },
      entitySummaries: [],
      hasConductedCompleteCheckStep: false,
      inferredClaims: [],
      outstandingTasks: [],
      plan: "",
      lastCompletedToolCalls: [],
      proposedEntities: [],
      questionsAndAnswers: null,
      submittedEntityIds: [],
      delegatedTasksCompleted: [],
      suggestionsForNextStepsMade: [],
      resourcesNotVisited: [],
      resourceUrlsVisited: [],
      webQueriesMade: [],
      workersStarted: [],
    };

  if (state.plan) {
    /**
     * This is a restart or reset of a workflow run.
     * Because state is currently only captured at the coordinator level, in-progress sub-agents may have done work
     * which have not been captured in the state, and needs to be undone to stop it being associated with the flow.
     *
     * This is currently only claims persisted in the graph but not yet reported to the coordinator.
     *
     * @todo improve this via one of
     *   - earlier report of discovered claims to the coordinator
     *   - maintain recoverable state in sub-agents
     */
    const { createEntitiesAsDraft, userAuthentication, flowEntityId, stepId } =
      await getFlowContext();

    const { entities: persistedClaims } = await queryEntities(
      { graphApi: graphApiClient },
      userAuthentication,
      {
        includeDrafts: createEntitiesAsDraft,
        temporalAxes: currentTimeInstantTemporalAxes,
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.claim.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                {
                  path: ["editionProvenance", "origin", "id"],
                },
                {
                  parameter: flowEntityId,
                },
              ],
            },
            {
              equal: [
                {
                  path: ["editionProvenance", "origin", "stepIds", 0],
                },
                {
                  parameter: stepId,
                },
              ],
            },
          ],
        },
        includePermissions: false,
      },
    );

    const provenance: ProvidedEntityEditionProvenance = {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowEntityId,
        stepIds: [stepId],
      } satisfies OriginProvenance,
    };

    await Promise.all(
      persistedClaims
        .filter(
          (claim) =>
            !state.inferredClaims.some(
              (claimInState) =>
                claimInState.claimId === claim.metadata.recordId.entityId,
            ),
        )
        .map(async (claim) =>
          graphApiClient.patchEntity(userAuthentication.actorId, {
            entityId: claim.metadata.recordId.entityId,
            archived: true,
            provenance,
          }),
        ),
    );
  }

  /**
   * This action (Temporal activity) handles cancellation, and we set the workflow to WAIT_CANCELLATION_COMPLETED,
   * which means we need to throw the cancelled error if and when we're notified of cancellation.
   *
   * runCoordinatingAgent will continue to run until completion in any event, and so it has logic in various places
   * inside it to check if the activity has been cancelled (look for status: "aborted" or isActivityCancelled),
   * and to bail out of doing further work if so.
   *
   * @todo H-3129: refactor this action into a child workflow which calls other activities / child workflows,
   *    in which case any single activity which is running when the workflow is cancelled will be doing less work.
   *    There will still be a need to check for cancellation in these functions so that they can bail sooner to save
   *   resource and to avoid making undesired database mutations etc.
   */
  return Promise.race([
    runCoordinatingAgent({
      ...params,
      state,
    }),
    heartbeatAndWaitCancellation(state),
  ]);
};
