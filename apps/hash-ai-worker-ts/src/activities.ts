import { getPropertyTypes } from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  BaseUrl,
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  PropertyObject,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractBaseUrl } from "@blockprotocol/type-system";
import type {
  Embedding,
  EntityEmbedding,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-graph-sdk/embeddings";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import { queryEntityTypeSubgraph } from "@local/hash-graph-sdk/entity-type";
import {
  currentTimeInstantTemporalAxes,
  generateEntityIdFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type { OpenAI } from "openai";

import { getAiAssistantAccountIdActivity } from "./activities/get-ai-assistant-account-id-activity.js";
import { getDereferencedEntityTypesActivity } from "./activities/get-dereferenced-entity-types-activity.js";
import { getWebPageActivity } from "./activities/get-web-page-activity.js";
import { getWebSearchResultsActivity } from "./activities/get-web-search-results-activity.js";
import { inferEntitiesFromWebPageActivity } from "./activities/infer-entities-from-web-page-activity.js";
import { parseTextFromFile } from "./activities/parse-text-from-file.js";
import {
  createDataTypeEmbeddings,
  createEmbeddings,
  createEntityEmbeddings,
  createEntityTypeEmbeddings,
  createPropertyTypeEmbeddings,
} from "./activities/shared/embeddings.js";

export { createGraphActivities } from "./activities/graph.js";

export const createAiActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async parseTextFromFileActivity(
    params: ParseTextFromFileParams,
  ): Promise<void> {
    return parseTextFromFile({ graphApiClient }, params);
  },

  async createEmbeddingsActivity(
    params: CreateEmbeddingsParams,
  ): Promise<CreateEmbeddingsReturn> {
    return createEmbeddings(params);
  },

  async createDataTypeEmbeddingsActivity(params: {
    dataType: DataTypeWithMetadata;
  }): Promise<{
    embedding: Embedding;
    usage: OpenAI.CreateEmbeddingResponse.Usage;
  }> {
    return createDataTypeEmbeddings({
      dataType: params.dataType,
    });
  },

  async createPropertyTypeEmbeddingsActivity(params: {
    propertyType: PropertyTypeWithMetadata;
  }): Promise<{
    embedding: Embedding;
    usage: OpenAI.CreateEmbeddingResponse.Usage;
  }> {
    return createPropertyTypeEmbeddings({
      propertyType: params.propertyType,
    });
  },

  async createEntityTypeEmbeddingsActivity(params: {
    entityType: EntityTypeWithMetadata;
  }): Promise<{
    embedding: Embedding;
    usage: OpenAI.CreateEmbeddingResponse.Usage;
  }> {
    return createEntityTypeEmbeddings({
      entityType: params.entityType,
    });
  },

  async createEntityEmbeddingsActivity(params: {
    entityProperties: PropertyObject;
    propertyTypes: PropertyTypeWithMetadata[];
  }): Promise<{
    embeddings: EntityEmbedding[];
    usage: OpenAI.CreateEmbeddingResponse.Usage;
  }> {
    return createEntityEmbeddings({
      entityProperties: params.entityProperties,
      propertyTypes: params.propertyTypes.map((propertyType) => ({
        title: propertyType.schema.title,
        $id: propertyType.schema.$id,
      })),
    });
  },

  /**
   * Combined activity that creates embeddings for a batch of entities and writes them directly to DB.
   * This avoids passing large embedding vectors or entities through workflow history.
   *
   * Handles everything internally:
   * - Fetches all entities by IDs in one query
   * - Skips FlowRun entities and entities with empty properties
   * - Queries entity type subgraph for property types
   * - Applies embedding exclusions
   * - Creates embeddings via OpenAI
   * - Stores to DB
   *
   * Returns only usage stats, not the embeddings themselves.
   */
  async createAndStoreEntityEmbeddingsActivity(params: {
    authentication: {
      actorId: ActorEntityUuid;
    };
    entityIds: EntityId[];
    embeddingExclusions?: Record<BaseUrl, BaseUrl[]>;
  }): Promise<OpenAI.CreateEmbeddingResponse.Usage> {
    const usage: OpenAI.CreateEmbeddingResponse.Usage = {
      prompt_tokens: 0,
      total_tokens: 0,
    };

    if (params.entityIds.length === 0) {
      return usage;
    }

    // Fetch all entities by IDs in one query
    const { entities } = await queryEntities(
      { graphApi: graphApiClient },
      params.authentication,
      {
        filter: {
          any: params.entityIds.map((entityId) =>
            generateEntityIdFilter({
              entityId,
              includeArchived: true,
            }),
          ),
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );

    for (const entity of entities) {
      // Skip FlowRun entities due to the size of their property values
      if (
        entity.metadata.entityTypeIds.includes(
          systemEntityTypes.flowRun.entityTypeId,
        )
      ) {
        continue;
      }

      // Skip entities with empty properties
      if (Object.keys(entity.properties).length === 0) {
        continue;
      }

      // Query entity type subgraph to get property types
      const { subgraph } = await queryEntityTypeSubgraph(
        graphApiClient,
        params.authentication,
        {
          filter: {
            any: entity.metadata.entityTypeIds.map(
              (entityTypeId: VersionedUrl) => ({
                equal: [
                  { path: ["versionedUrl"] },
                  { parameter: entityTypeId },
                ],
              }),
            ),
          },
          graphResolveDepths: {
            inheritsFrom: 255,
            constrainsPropertiesOn: 1,
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          traversalPaths: [],
        },
      );

      const propertyTypes = getPropertyTypes(subgraph);

      // Apply embedding exclusions
      const filteredProperties = { ...entity.properties };
      if (params.embeddingExclusions) {
        for (const entityTypeId of entity.metadata.entityTypeIds) {
          const entityTypeBaseUrl = extractBaseUrl(entityTypeId);
          const excludedProperties =
            params.embeddingExclusions[entityTypeBaseUrl];
          if (excludedProperties) {
            for (const propertyBaseUrl of excludedProperties) {
              delete filteredProperties[propertyBaseUrl];
            }
          }
        }
      }

      // Create embeddings
      const { embeddings, usage: entityUsage } = await createEntityEmbeddings({
        entityProperties: filteredProperties,
        propertyTypes: propertyTypes.map((propertyType) => ({
          title: propertyType.schema.title,
          $id: propertyType.schema.$id,
        })),
      });

      // Store to DB
      if (embeddings.length > 0) {
        await graphApiClient
          .updateEntityEmbeddings(params.authentication.actorId, {
            entityId: entity.metadata.recordId.entityId,
            embeddings: embeddings.map((embedding) => ({
              property: embedding.property,
              embedding: embedding.embedding,
            })),
            reset: true,
            updatedAtTransactionTime:
              entity.metadata.temporalVersioning.transactionTime.start.limit,
            updatedAtDecisionTime:
              entity.metadata.temporalVersioning.decisionTime.start.limit,
          })
          .then((response) => response.data);
      }

      usage.prompt_tokens += entityUsage.prompt_tokens;
      usage.total_tokens += entityUsage.total_tokens;
    }

    return usage;
  },

  getWebSearchResultsActivity,

  getWebPageActivity,

  async getDereferencedEntityTypesActivity(
    params: Omit<
      Parameters<typeof getDereferencedEntityTypesActivity>[0],
      "graphApiClient"
    >,
  ) {
    return getDereferencedEntityTypesActivity({
      ...params,
      graphApiClient,
    });
  },

  async getAiAssistantAccountIdActivity(
    params: Omit<
      Parameters<typeof getAiAssistantAccountIdActivity>[0],
      "graphApiClient"
    >,
  ) {
    return getAiAssistantAccountIdActivity({
      ...params,
      graphApiClient,
    });
  },

  inferEntitiesFromWebPageActivity,
});
