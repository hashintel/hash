import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import type { ActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { answerQuestionAction } from "./flow-activities/answer-question-action";
import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action";
import { persistEntitiesAction } from "./flow-activities/persist-entities-action";
import { persistEntityAction } from "./flow-activities/persist-entity-action";
import { createPersistFlowActivity } from "./flow-activities/persist-flow-activity";
import { researchEntitiesAction } from "./flow-activities/research-entities-action";
import type { FlowActionActivity } from "./flow-activities/types";
import { webSearchAction } from "./flow-activities/web-search-action";
import { writeGoogleSheetAction } from "./flow-activities/write-google-sheet-action";

export const createFlowActionActivities = ({
  graphApiClient,
  vaultClient,
}: {
  graphApiClient: GraphApi;
  vaultClient: VaultClient;
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
  async persistEntitiesAction(
    params: Omit<Parameters<typeof persistEntitiesAction>[0], "graphApiClient">,
  ) {
    return persistEntitiesAction({ ...params, graphApiClient });
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
  answerQuestionAction(
    params: Omit<Parameters<typeof answerQuestionAction>[0], "graphApiClient">,
  ) {
    return answerQuestionAction({ ...params, graphApiClient });
  },
  writeGoogleSheetAction(
    params: Omit<
      Parameters<typeof writeGoogleSheetAction>[0],
      "graphApiClient" | "vaultClient"
    >,
  ) {
    return writeGoogleSheetAction({ ...params, graphApiClient, vaultClient });
  },
});

export const createFlowActivities = ({
  graphApiClient,
  vaultClient,
}: {
  graphApiClient: GraphApi;
  vaultClient: VaultClient;
}) => ({
  ...createFlowActionActivities({ graphApiClient, vaultClient }),
  persistFlowActivity: createPersistFlowActivity({ graphApiClient }),
});
