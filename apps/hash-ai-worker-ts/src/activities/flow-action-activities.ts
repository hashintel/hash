import type { GraphApi } from "@local/hash-graph-client";
import type { ActionDefinitionId } from "@local/hash-isomorphic-utils/flows/step-definitions";

import { generateWebQueriesAction } from "./flow-action-activities/generate-web-queries-action";
import { getWebPageByUrlAction } from "./flow-action-activities/get-web-page-by-url-action";
import { inferEntitiesFromContentAction } from "./flow-action-activities/infer-entities-from-content-action";
import { persistEntityAction } from "./flow-action-activities/persist-entity-action";
import type { FlowActionActivity } from "./flow-action-activities/types";
import { webSearchAction } from "./flow-action-activities/web-search-action";

export const createFlowActionActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}): Record<`${ActionDefinitionId}Action`, FlowActionActivity> => ({
  generateWebQueriesAction,
  webSearchAction,
  getWebPageByUrlAction,
  async inferEntitiesFromContentAction(
    params: Omit<
      Parameters<typeof inferEntitiesFromContentAction>[0],
      "graphApiClient"
    >,
  ) {
    return inferEntitiesFromContentAction({ ...params, graphApiClient });
  },
  async persistEntityAction(
    params: Omit<Parameters<typeof persistEntityAction>[0], "graphApiClient">,
  ) {
    return persistEntityAction({ ...params, graphApiClient });
  },
});
