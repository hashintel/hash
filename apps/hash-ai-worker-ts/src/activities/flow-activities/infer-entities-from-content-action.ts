import type {
  EntityId,
  EntityUuid,
  OriginProvenance,
  PropertyObjectMetadata,
  SourceProvenance,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  currentTimestamp,
  entityIdFromComponents,
} from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedAiFlowActionInputs,
  type OutputNameForAiFlowAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { StatusCode } from "@local/status";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity.js";
import { getDereferencedEntityTypesActivity } from "../get-dereferenced-entity-types-activity.js";
import type {
  DereferencedEntityTypesByTypeId,
  InferenceState,
} from "../infer-entities/inference-types.js";
import { inferEntitiesFromWebPageActivity } from "../infer-entities-from-web-page-activity.js";
import { getFlowContext } from "../shared/get-flow-context.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { inferenceModelAliasToSpecificModel } from "../shared/inference-model-alias-to-llm-model.js";
import { isPermittedOpenAiModel } from "../shared/openai-client.js";

export const inferEntitiesFromContentAction: FlowActionActivity = async ({
  inputs,
}) => {
  const {
    content,
    entityTypeIds,
    model: modelAlias,
    relevantEntitiesPrompt,
  } = getSimplifiedAiFlowActionInputs({
    inputs,
    actionType: "inferEntitiesFromContent",
  });

  const { flowEntityId, userAuthentication, stepId, webId } =
    await getFlowContext();

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: userAuthentication,
    grantCreatePermissionForWeb: webId,
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
      entityTypeIds,
      actorId: userAuthentication.actorId,
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

  if (!isInferenceModelName(modelAlias)) {
    return {
      code: StatusCode.InvalidArgument,
      message: `Invalid inference model name: ${modelAlias}`,
      contents: [],
    };
  }

  const model = inferenceModelAliasToSpecificModel[modelAlias];

  if (!isPermittedOpenAiModel(model)) {
    return {
      code: StatusCode.InvalidArgument,
      message: `Model must be an OpenAI model, provided: ${model}`,
      contents: [],
    };
  }

  const processBeginTime = currentTimestamp();

  const status = await inferEntitiesFromWebPageActivity({
    webPage: content,
    relevantEntitiesPrompt,
    model,
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

  webPageInferenceState = status.contents[0]!;

  const source: SourceProvenance =
    typeof content === "object"
      ? {
          type: "webpage",
          loadedAt: processBeginTime,
          location: {
            uri: content.url,
            name: content.title,
          },
        }
      : { type: "document", loadedAt: processBeginTime };

  /**
   * We want to rewrite the numerical identifiers the LLM generates to real EntityIds
   * We need to record these first to be able to replace the source/target entity ids when we encounter links
   */
  const localIdToEntityId: Record<number, EntityId> = {};
  for (const proposal of Object.values(
    webPageInferenceState.proposedEntityCreationsByType,
  ).flat()) {
    localIdToEntityId[proposal.entityId] = entityIdFromComponents(
      webId,
      generateUuid() as EntityUuid,
    );
  }

  const proposedEntities = Object.entries(
    webPageInferenceState.proposedEntityCreationsByType,
  ).flatMap(([entityTypeId, proposedEntitiesByType]) =>
    proposedEntitiesByType.map<ProposedEntity>((proposal) => {
      const summary = webPageInferenceState.proposedEntitySummaries.find(
        (proposedEntitySummary) =>
          proposedEntitySummary.entityId === proposal.entityId,
      )?.summary;

      const provenance: ProposedEntity["provenance"] = {
        actorType: "ai",
        origin: {
          type: "flow",
          stepIds: [stepId],
          id: flowEntityId,
        } satisfies OriginProvenance,
      };

      return {
        localEntityId: localIdToEntityId[proposal.entityId]!,
        entityTypeIds: [entityTypeId as VersionedUrl],
        claims: {
          isObjectOf: [],
          isSubjectOf: [],
        },
        summary,
        properties: proposal.properties ?? {},
        propertyMetadata: typedKeys(
          proposal.properties ?? {},
        ).reduce<PropertyObjectMetadata>(
          (acc, propertyKey) => {
            acc.value[propertyKey] = {
              metadata: { dataTypeId: null, provenance: { sources: [source] } },
            };

            return acc;
          },
          { value: {} },
        ),
        provenance,
        sourceEntityId:
          "sourceEntityId" in proposal
            ? {
                kind: "proposed-entity",
                localId: localIdToEntityId[proposal.sourceEntityId]!,
              }
            : undefined,
        targetEntityId:
          "targetEntityId" in proposal
            ? {
                kind: "proposed-entity",
                localId: localIdToEntityId[proposal.targetEntityId]!,
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
              "proposedEntities" satisfies OutputNameForAiFlowAction<"inferEntitiesFromContent">,
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
