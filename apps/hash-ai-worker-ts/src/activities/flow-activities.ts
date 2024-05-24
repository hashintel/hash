import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { ActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { answerQuestionAction } from "./flow-activities/answer-question-action";
import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action";
import { persistEntitiesAction } from "./flow-activities/persist-entities-action";
import { persistEntityAction } from "./flow-activities/persist-entity-action";
import { persistFlowActivity } from "./flow-activities/persist-flow-activity";
import { processAutomaticBrowsingSettingsAction } from "./flow-activities/process-automatic-browsing-settings-action";
import { researchEntitiesAction } from "./flow-activities/research-entities-action";
import type { FlowActionActivity } from "./flow-activities/types";
import { userHasPermissionToRunFlowInWebActivity } from "./flow-activities/user-has-permission-to-run-flow-in-web-activity";
import { webSearchAction } from "./flow-activities/web-search-action";
import { writeGoogleSheetAction } from "./flow-activities/write-google-sheet-action";

export const createFlowActionActivities = ({
  vaultClient,
}: {
  vaultClient: VaultClient;
}): Record<`${ActionDefinitionId}Action`, FlowActionActivity> => ({
  generateWebQueriesAction,
  webSearchAction,
  getWebPageByUrlAction,
  processAutomaticBrowsingSettingsAction,
  inferEntitiesFromContentAction,
  persistEntityAction,
  persistEntitiesAction,
  getFileFromUrlAction,
  researchEntitiesAction,
  getWebPageSummaryAction,
  answerQuestionAction,
  writeGoogleSheetAction(
    params: Omit<Parameters<typeof writeGoogleSheetAction>[0], "vaultClient">,
  ) {
    return writeGoogleSheetAction({ ...params, vaultClient });
  },
});

export const createFlowActivities = ({
  vaultClient,
}: {
  vaultClient: VaultClient;
}) => ({
  ...createFlowActionActivities({ vaultClient }),
  persistFlowActivity,
  userHasPermissionToRunFlowInWebActivity,
});
