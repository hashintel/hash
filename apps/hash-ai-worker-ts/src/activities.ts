import type {
  Embedding,
  EntityEmbedding,
  GraphApi,
} from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type {
  DataTypeWithMetadata,
  EntityPropertiesObject,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { ApplicationFailure } from "@temporalio/activity";
import type { CreateEmbeddingResponse } from "openai/resources";

import { createEntitiesActivity } from "./activities/create-entities-activity";
import { createInferenceUsageRecordActivity } from "./activities/create-inference-usage-record-activity";
import { getAiAssistantAccountIdActivity } from "./activities/get-ai-assistant-account-id-activity";
import { getDereferencedEntityTypesActivity } from "./activities/get-dereferenced-entity-types-activity";
import { getTextFromWebPageActivity } from "./activities/get-text-from-web-page-activity";
import { getWebSearchResultsActivity } from "./activities/get-web-search-results-activity";
import { inferEntitiesActivity } from "./activities/infer-entities";
import { inferEntitiesFromWebPageActivity } from "./activities/infer-entities-from-web-page-activity";
import { parseTextFromFile } from "./activities/parse-text-from-file";
import {
  createDataTypeEmbeddings,
  createEmbeddings,
  createEntityEmbeddings,
  createEntityTypeEmbeddings,
  createPropertyTypeEmbeddings,
} from "./activities/shared/embeddings";
import { userExceededServiceUsageLimitActivity } from "./activities/user-exceeded-service-usage-limit-activity";

export { createGraphActivities } from "./activities/graph";

export const createAiActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async inferEntitiesActivity(
    params: InferEntitiesCallerParams,
  ): Promise<InferEntitiesReturn> {
    const status = await inferEntitiesActivity({ ...params, graphApiClient });
    if (status.code !== StatusCode.Ok) {
      throw new ApplicationFailure(status.message, status.code, true, [status]);
    }

    return status;
  },

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
    usage: CreateEmbeddingResponse.Usage;
  }> {
    return createDataTypeEmbeddings({
      dataType: params.dataType,
    });
  },

  async createPropertyTypeEmbeddingsActivity(params: {
    propertyType: PropertyTypeWithMetadata;
  }): Promise<{
    embedding: Embedding;
    usage: CreateEmbeddingResponse.Usage;
  }> {
    return createPropertyTypeEmbeddings({
      propertyType: params.propertyType,
    });
  },

  async createEntityTypeEmbeddingsActivity(params: {
    entityType: EntityTypeWithMetadata;
  }): Promise<{
    embedding: Embedding;
    usage: CreateEmbeddingResponse.Usage;
  }> {
    return createEntityTypeEmbeddings({
      entityType: params.entityType,
    });
  },

  async createEntityEmbeddingsActivity(params: {
    entityProperties: EntityPropertiesObject;
    propertyTypes: PropertyTypeWithMetadata[];
  }): Promise<{
    embeddings: EntityEmbedding[];
    usage: CreateEmbeddingResponse.Usage;
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

  getTextFromWebPageActivity,

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

  async inferEntitiesFromWebPageActivity(
    params: Omit<
      Parameters<typeof inferEntitiesFromWebPageActivity>[0],
      "graphApiClient"
    >,
  ) {
    return inferEntitiesFromWebPageActivity({
      ...params,
      graphApiClient,
    });
  },

  async createEntitiesActivity(
    params: Omit<
      Parameters<typeof createEntitiesActivity>[0],
      "graphApiClient"
    >,
  ) {
    return createEntitiesActivity({
      ...params,
      graphApiClient,
    });
  },

  async userExceededServiceUsageLimitActivity(
    params: Omit<
      Parameters<typeof userExceededServiceUsageLimitActivity>[0],
      "graphApiClient"
    >,
  ) {
    return userExceededServiceUsageLimitActivity({
      ...params,
      graphApiClient,
    });
  },

  async createInferenceUsageRecordActivity(
    params: Omit<
      Parameters<typeof createInferenceUsageRecordActivity>[0],
      "graphApiClient"
    >,
  ) {
    return createInferenceUsageRecordActivity({
      ...params,
      graphApiClient,
    });
  },
});
