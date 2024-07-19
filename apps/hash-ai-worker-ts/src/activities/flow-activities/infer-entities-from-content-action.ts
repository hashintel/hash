import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedKeys } from "@local/advanced-types/typed-entries";
import type {
  OriginProvenance,
  SourceProvenance,
} from "@local/hash-graph-client";
import type {
  EntityId,
  PropertyMetadataObject,
} from "@local/hash-graph-types/entity";
import { isInferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
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
import { mapActionInputEntitiesToEntities } from "../shared/map-action-input-entities-to-entities.js";
import { isPermittedOpenAiModel } from "../shared/openai-client.js";

import type { FlowActionActivity } from "./types.js";

export const inferEntitiesFromContentAction: FlowActionActivity = async ({
  inputs,
}) => {
  const {
    content,
    entityTypeIds,
    model: modelAlias,
    relevantEntitiesPrompt,
    existingEntities: inputExistingEntities,
  } = getSimplifiedActionInputs({
    inputs,
    actionType: "inferEntitiesFromContent",
  });

  const existingEntities = inputExistingEntities
    ? mapActionInputEntitiesToEntities({ inputEntities: inputExistingEntities })
    : [];

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
  ).reduce<DereferencedEntityTypesByTypeId>((accumulator, [entityTypeId, entityType]) => {
    if (entityTypeIds.includes(entityTypeId as VersionedUrl)) {
      accumulator[entityTypeId as VersionedUrl] = entityType;
    }

    return accumulator;
  }, {});

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

  const processBeginTime = new Date().toISOString();

  const status = await inferEntitiesFromWebPageActivity({
    webPage: content,
    relevantEntitiesPrompt,
    model,
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
        localEntityId: `${actionIdPrefix}-${proposal.entityId}`,
        entityTypeId: entityTypeId as VersionedUrl,
        summary,
        properties: proposal.properties ?? {},
        propertyMetadata: typedKeys(
          proposal.properties ?? {},
        ).reduce<PropertyMetadataObject>(
          (accumulator, propertyKey) => {
            accumulator.value[propertyKey] = {
              metadata: { provenance: { sources: [source] } },
            };

            return accumulator;
          },
          { value: {} },
        ),
        provenance,
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
