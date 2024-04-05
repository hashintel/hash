import type { GraphApi } from "@local/hash-graph-client";
import type { ActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action";
import { persistEntityAction } from "./flow-activities/persist-entity-action";
import { createPersistFlowActivity } from "./flow-activities/persist-flow-activity";
import { researchEntitiesAction } from "./flow-activities/research-entities-action";
import type { FlowActionActivity } from "./flow-activities/types";
import { webSearchAction } from "./flow-activities/web-search-action";

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
  async getFileFromUrlAction(
    params: Omit<Parameters<typeof getFileFromUrlAction>[0], "graphApiClient">,
  ) {
    return getFileFromUrlAction({ ...params, graphApiClient });
  },
  async researchEntitiesAction(
    params: Omit<
      Parameters<typeof researchEntitiesAction>[0],
      "graphApiClient"
    >,
  ) {
    return researchEntitiesAction({ ...params, graphApiClient });
  },
  getWebPageSummaryAction,
});

export const createFlowActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  ...createFlowActionActivities({ graphApiClient }),
  persistFlowActivity: createPersistFlowActivity({ graphApiClient }),
});
