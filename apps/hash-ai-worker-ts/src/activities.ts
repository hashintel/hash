import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyObject,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type {
  Embedding,
  EntityEmbedding,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-graph-sdk/embeddings";
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

export { createDashboardConfigurationActivities } from "./activities/dashboard-configuration.js";
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
