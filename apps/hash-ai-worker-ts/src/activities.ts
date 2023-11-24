import type { GraphApi } from "@local/hash-graph-client";
import { Entity } from "@local/hash-subgraph";
import { Status } from "@local/status";

import {
  inferEntities,
  InferEntitiesCallerParams,
} from "./activities/infer-entities";

export const createAiActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async inferEntitiesActivity(
    params: InferEntitiesCallerParams,
  ): Promise<Status<Entity[]>> {
    const status = await inferEntities({ ...params, graphApiClient });
    if (status.code !== "OK") {
      // @todo how to return something but also register an error in Temporal?
    }
    return status;
  },
});
