import type { GraphApi } from "@local/hash-graph-client";
import {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/temporal-types";

import { inferEntities } from "./activities/infer-entities";

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
      throw new Error(status.message, {
        cause: status,
      });
    }

    return status;
  },
});
