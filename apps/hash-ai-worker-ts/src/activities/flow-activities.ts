import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { ActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { answerQuestionAction } from "./flow-activities/answer-question-action.js";
import { generateFlowRunName } from "./flow-activities/generate-flow-run-name-activity.js";
import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action.js";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action.js";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action.js";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action.js";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action.js";
import { persistEntitiesAction } from "./flow-activities/persist-entities-action.js";
import { persistEntityAction } from "./flow-activities/persist-entity-action.js";
import { persistFlowActivity } from "./flow-activities/persist-flow-activity.js";
import { processAutomaticBrowsingSettingsAction } from "./flow-activities/process-automatic-browsing-settings-action.js";
import { researchEntitiesAction } from "./flow-activities/research-entities-action.js";
import type { FlowActionActivity } from "./flow-activities/types.js";
import { userHasPermissionToRunFlowInWebActivity } from "./flow-activities/user-has-permission-to-run-flow-in-web-activity.js";
import { webSearchAction } from "./flow-activities/web-search-action.js";
import { writeGoogleSheetAction } from "./flow-activities/write-google-sheet-action.js";

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
  generateFlowRunName,
  persistFlowActivity,
  userHasPermissionToRunFlowInWebActivity,
});
