import type { CreateFlowActivities } from "@local/hash-backend-utils/flows";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { AiFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { answerQuestionAction } from "./flow-activities/answer-question-action.js";
import { generateFlowRunName } from "./flow-activities/generate-flow-run-name-activity.js";
import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action.js";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action.js";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action.js";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action.js";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action.js";
import { inferMetadataFromDocumentAction } from "./flow-activities/infer-metadata-from-document-action.js";
import { persistEntitiesAction } from "./flow-activities/persist-entities-action.js";
import { persistEntityAction } from "./flow-activities/persist-entity-action.js";
import { processAutomaticBrowsingSettingsAction } from "./flow-activities/process-automatic-browsing-settings-action.js";
import { researchEntitiesAction } from "./flow-activities/research-entities-action.js";
import { webSearchAction } from "./flow-activities/web-search-action.js";
import { writeGoogleSheetAction } from "./flow-activities/write-google-sheet-action.js";

export const createFlowActionActivities: CreateFlowActivities<
  AiFlowActionDefinitionId
> = ({ vaultClient }: { vaultClient: VaultClient }) => ({
  generateWebQueriesAction,
  webSearchAction,
  getWebPageByUrlAction,
  processAutomaticBrowsingSettingsAction,
  inferEntitiesFromContentAction,
  inferMetadataFromDocumentAction,
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
});
