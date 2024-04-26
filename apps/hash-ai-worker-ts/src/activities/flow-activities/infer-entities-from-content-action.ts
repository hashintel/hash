import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { getDereferencedEntityTypesActivity } from "../get-dereferenced-entity-types-activity";
import type { InferenceState } from "../infer-entities/inference-types";
import { inferEntitiesFromWebPageActivity } from "../infer-entities-from-web-page-activity";
import { modelAliasToSpecificModel } from "../shared/openai-client";
import type { FlowActionActivity } from "./types";

export const inferEntitiesFromContentAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, graphApiClient, userAuthentication }) => {
  const { content, entityTypeIds, model, relevantEntitiesPrompt } =
    getSimplifiedActionInputs({
      inputs,
      actionType: "inferEntitiesFromContent",
    });

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: userAuthentication,
    /**
     * @todo: we probably want this customizable by an input for the action, or
     * as an additional parameter for the activity.
     */
    grantCreatePermissionForWeb: userAuthentication.actorId as OwnedById,
    graphApiClient,
  });

  if (!aiAssistantAccountId) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: "Could not retrieve hash-ai entity",
    };
  }

  const entityTypes = await getDereferencedEntityTypesActivity({
    entityTypeIds,
    graphApiClient,
    actorId: aiAssistantAccountId,
    simplifyPropertyKeys: true,
  });

  let webPageInferenceState: InferenceState = {
    iterationCount: 1,
    inProgressEntityIds: [],
    proposedEntitySummaries: [],
    proposedEntityCreationsByType: {},
    resultsByTemporaryId: {},
    usage: [],
  };

  if (!isInferenceModelName(model)) {
    return {
      code: StatusCode.InvalidArgument,
      message: `Invalid inference model name: ${model}`,
      contents: [],
    };
  }

  const status = await inferEntitiesFromWebPageActivity({
    graphApiClient,
    webPage: content,
    relevantEntitiesPrompt,
    validationActorId: userAuthentication.actorId,
    model: modelAliasToSpecificModel[model],
    entityTypes,
    inferenceState: webPageInferenceState,
  });

  if (status.code !== StatusCode.Ok) {
    return {
      code: status.code,
      contents: [],
      message: status.message,
    };
  }

  const actionIdPrefix = generateUuid();

  webPageInferenceState = status.contents[0]!;

  const proposedEntities = Object.entries(
    webPageInferenceState.proposedEntityCreationsByType,
  ).flatMap(([entityTypeId, proposedEntitiesByType]) =>
    proposedEntitiesByType.map<ProposedEntity>((proposal) => {
      const summary = webPageInferenceState.proposedEntitySummaries.find(
        (proposedEntitySummary) =>
          proposedEntitySummary.entityId === proposal.entityId,
      )?.summary;

      return {
        localEntityId: `${actionIdPrefix}-${proposal.entityId}`,
        entityTypeId: entityTypeId as VersionedUrl,
        summary,
        properties: proposal.properties ?? {},
        sourceEntityLocalId:
          "sourceEntityId" in proposal
            ? `${actionIdPrefix}-${proposal.sourceEntityId}`
            : undefined,
        targetEntityLocalId:
          "targetEntityId" in proposal
            ? `${actionIdPrefix}-${proposal.targetEntityId}`
            : undefined,
      };
    }),
  );

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">,
            payload: {
              kind: "ProposedEntity",
              value: proposedEntities,
            },
          },
        ],
      },
    ],
  };
};
