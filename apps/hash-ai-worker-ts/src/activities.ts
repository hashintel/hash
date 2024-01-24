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
import { fetchFileActivity } from "./activities/fetch-file";
import { inferEntities } from "./activities/infer-entities";
import { parseTextFromFileActivity } from "./activities/parse-text-from-file";

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

  async fetchFileFromUrlActivity(
    ...params: Parameters<typeof fetchFileActivity>
  ): ReturnType<typeof fetchFileActivity> {
    return fetchFileActivity(...params);
  },

  async parseTextFromFileActivity(
    params: Parameters<typeof parseTextFromFileActivity>[1],
  ): ReturnType<typeof parseTextFromFileActivity> {
    return parseTextFromFileActivity({ graphApiClient }, params);
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
