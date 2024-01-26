import type { GraphApi } from "@local/hash-graph-client";
import type {
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

import { createEmbeddings } from "./activities/embeddings";
import { inferEntitiesActivity } from "./activities/infer-entities";

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
