import type { InferEntitiesCallerParams } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { AccountId, Entity } from "@local/hash-subgraph";
import { proxyActivities } from "@temporalio/workflow";
import { CreateEmbeddingResponse } from "openai/resources";

import { createAiActivities, createGraphActivities } from "./activities";

const aiActivities = proxyActivities<ReturnType<typeof createAiActivities>>({
  startToCloseTimeout: "3600 second", // 1 hour
  retry: {
    maximumAttempts: 1,
  },
});

const graphActivities = proxyActivities<
  ReturnType<typeof createGraphActivities>
>({
  startToCloseTimeout: "10 second",
  retry: {
    maximumAttempts: 3,
  },
});

export const inferEntities = (params: InferEntitiesCallerParams) =>
  aiActivities.inferEntitiesActivity(params);

export const updateEntityEmbeddings = async (params: {
  authentication: {
    actorId: AccountId;
  };
  entity: Entity;
}): Promise<CreateEmbeddingResponse.Usage> => {
  const subgraph = await graphActivities.getEntityTypesByQuery({
    authentication: params.authentication,
    query: {
      filter: {
        equal: [
          { path: ["versionedUrl"] },
          { parameter: params.entity.metadata.entityTypeId },
        ],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 255 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 1 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { incoming: 0, outgoing: 0 },
        hasRightEntity: { incoming: 0, outgoing: 0 },
      },
      temporalAxes: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          interval: {
            start: null,
            end: null,
          },
        },
      },
      includeDrafts: false,
    },
  });
  const propertyTypes = await graphActivities.getSubgraphPropertyTypes({
    subgraph,
  });

  const generatedEmbeddings = await aiActivities.createEmbeddingsActivity({
    entityProperties: params.entity.properties,
    propertyTypes,
  });

  if (generatedEmbeddings.embeddings.length > 0) {
    await graphActivities.updateEntityEmbeddings({
      authentication: params.authentication,
      embeddings: generatedEmbeddings.embeddings.map((embedding) => ({
        ...embedding,
        entityId: params.entity.metadata.recordId.entityId,
      })),
    });
  }

  return generatedEmbeddings.usage;
};
