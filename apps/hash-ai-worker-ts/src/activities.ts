import type { GraphApi } from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type {
  BaseUrl,
  EntityPropertiesObject,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { ApplicationFailure } from "@temporalio/activity";
import { CreateEmbeddingResponse } from "openai/resources";

import { inferEntities } from "./activities/infer-entities";
import {
  createEmbeddings,
  createEntityEmbeddings,
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
    const status = await inferEntities({ ...params, graphApiClient });
    if (status.code !== StatusCode.Ok) {
      throw new ApplicationFailure(status.message, status.code, true, [status]);
    }

    return status;
  },

  async createEmbeddingsActivity(
    params: CreateEmbeddingsParams,
  ): Promise<CreateEmbeddingsReturn> {
    return createEmbeddings(params);
  },

  async createEntityEmbeddingsActivity(params: {
    entityProperties: EntityPropertiesObject;
    propertyTypes: PropertyTypeWithMetadata[];
  }): Promise<{
    embeddings: { property?: BaseUrl; embedding: number[] }[];
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
