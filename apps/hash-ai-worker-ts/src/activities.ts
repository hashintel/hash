import type { GraphApi } from "@local/hash-graph-client";
import type {
  InferEntitiesCallerParams,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/temporal-types";
import { ApplicationFailure } from "@temporalio/activity";

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
      throw new ApplicationFailure(status.message, status.code, true, [status]);
    }

    return status;
  },
});
