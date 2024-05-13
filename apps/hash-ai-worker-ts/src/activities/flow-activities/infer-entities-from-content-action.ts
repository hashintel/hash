import type { VersionedUrl } from "@blockprotocol/type-system";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { EntityId, OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { getDereferencedEntityTypesActivity } from "../get-dereferenced-entity-types-activity";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "../infer-entities/inference-types";
import { inferEntitiesFromWebPageActivity } from "../infer-entities-from-web-page-activity";
import { getFlowContext } from "../shared/get-flow-context";
import { graphApiClient } from "../shared/graph-api-client";
import { mapActionInputEntitiesToEntities } from "../shared/map-action-input-entities-to-entities";
import { modelAliasToSpecificModel } from "../shared/openai-client";
import type { FlowActionActivity } from "./types";

export const inferEntitiesFromContentAction: FlowActionActivity = async ({
  inputs,
}) => {
  const {
    content,
    entityTypeIds,
    model,
    relevantEntitiesPrompt,
    existingEntities: inputExistingEntities,
  } = getSimplifiedActionInputs({
    inputs,
    actionType: "inferEntitiesFromContent",
  });

  const existingEntities = inputExistingEntities
    ? mapActionInputEntitiesToEntities({ inputEntities: inputExistingEntities })
    : [];

  const { userAuthentication } = await getFlowContext();

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

  const dereferencedEntityTypesWithExistingEntitiesTypes =
    await getDereferencedEntityTypesActivity({
      graphApiClient,
      entityTypeIds: [
        ...entityTypeIds,
        ...existingEntities.map(({ metadata }) => metadata.entityTypeId),
      ].filter(
        (entityTypeId, index, all) => all.indexOf(entityTypeId) === index,
      ),
      actorId: userAuthentication.actorId,
      simplifyPropertyKeys: true,
    });

  const entityTypes = Object.entries(
    dereferencedEntityTypesWithExistingEntitiesTypes,
  ).reduce((acc, [entityTypeId, entityType]) => {
    if (entityTypeIds.includes(entityTypeId as VersionedUrl)) {
      acc[entityTypeId as VersionedUrl] = entityType;
    }

    return acc;
  }, {} as DereferencedEntityTypesByTypeId);

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
    webPage: content,
    relevantEntitiesPrompt,
    model: modelAliasToSpecificModel[model],
    entityTypes,
    inferenceState: webPageInferenceState,
    existingEntities,
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
        sourceEntityId:
          "sourceEntityId" in proposal
            ? typeof proposal.sourceEntityId === "number"
              ? {
                  kind: "proposed-entity",
                  localId: `${actionIdPrefix}-${proposal.sourceEntityId}`,
                }
              : {
                  kind: "existing-entity",
                  entityId: proposal.sourceEntityId as EntityId,
                }
            : undefined,
        targetEntityId:
          "targetEntityId" in proposal
            ? typeof proposal.targetEntityId === "number"
              ? {
                  kind: "proposed-entity",
                  localId: `${actionIdPrefix}-${proposal.targetEntityId}`,
                }
              : {
                  kind: "existing-entity",
                  entityId: proposal.targetEntityId as EntityId,
                }
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
