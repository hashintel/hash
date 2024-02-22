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
import { ParseTextFromFileParams } from "@local/hash-isomorphic-utils/parse-text-from-file-types";
import type {
  DataTypeWithMetadata,
  EntityPropertiesObject,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { ApplicationFailure } from "@temporalio/activity";
import { CreateEmbeddingResponse } from "openai/resources";

import { inferEntitiesActivity } from "./activities/infer-entities";
import { parseTextFromFile } from "./activities/parse-text-from-file";
import {
  createDataTypeEmbeddings,
  createEmbeddings,
  createEntityEmbeddings,
  createEntityTypeEmbeddings,
  createPropertyTypeEmbeddings,
} from "./activities/shared/embeddings";

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
});
