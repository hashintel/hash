import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import {
  BaseUrl,
  EntityPropertiesObject,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { ApplicationFailure } from "@temporalio/activity";
import { CreateEmbeddingResponse } from "openai/resources";

import { createEmbeddings } from "./activities/embeddings";
import { inferEntities } from "./activities/infer-entities";

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
    if (status.code !== "OK") {
      throw new ApplicationFailure(status.message, status.code, true, [status]);
    }

    return status;
  },

  async createEmbeddingsActivity(params: {
    entityProperties: EntityPropertiesObject;
    propertyTypes: PropertyTypeWithMetadata[];
  }): Promise<{
    embeddings: { property?: BaseUrl; embedding: number[] }[];
    usage: CreateEmbeddingResponse.Usage;
  }> {
    return createEmbeddings(params);
  },
});
