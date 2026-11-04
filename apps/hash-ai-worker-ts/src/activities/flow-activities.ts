import { wrapFlowActionActivities } from "@local/hash-backend-utils/flows/wrap-flow-action-activities";

import { aggregateAction } from "./flow-activities/aggregate-action.js";
import { analyzeEntityDataAction } from "./flow-activities/analyze-entity-data-action.js";
import { answerQuestionAction } from "./flow-activities/answer-question-action.js";
import { createEntityAction } from "./flow-activities/create-entity-action.js";
import { draftMessageAction } from "./flow-activities/draft-message-action.js";
import { filterListAction } from "./flow-activities/filter-list-action.js";
import { findAction } from "./flow-activities/find-action.js";
import { generateChartConfigAction } from "./flow-activities/generate-chart-config-action.js";
import { generateFlowRunName } from "./flow-activities/generate-flow-run-name-activity.js";
import { generateStructuralQueryAction } from "./flow-activities/generate-structural-query-action.js";
import { generateWebQueriesAction } from "./flow-activities/generate-web-queries-action.js";
import { getFileFromUrlAction } from "./flow-activities/get-file-from-url-action.js";
import { getWebPageByUrlAction } from "./flow-activities/get-web-page-by-url-action.js";
import { getWebPageSummaryAction } from "./flow-activities/get-web-page-summary-action.js";
import { ifAction } from "./flow-activities/if-action.js";
import { inferEntitiesFromContentAction } from "./flow-activities/infer-entities-from-content-action.js";
import { inferMetadataFromDocumentAction } from "./flow-activities/infer-metadata-from-document-action.js";
import { orderByAction } from "./flow-activities/order-by-action.js";
import { persistEntitiesAction } from "./flow-activities/persist-entities-action.js";
import { persistEntityAction } from "./flow-activities/persist-entity-action.js";
import { planDashboardRefinementAction } from "./flow-activities/plan-dashboard-refinement-action.js";
import { processAutomaticBrowsingSettingsAction } from "./flow-activities/process-automatic-browsing-settings-action.js";
import { queryEntitiesAction } from "./flow-activities/query-entities-action.js";
import { researchEntitiesAction } from "./flow-activities/research-entities-action.js";
import { takeFirstAction } from "./flow-activities/take-first-action.js";
import { updateEntityAction } from "./flow-activities/update-entity-action.js";
import { webSearchAction } from "./flow-activities/web-search-action.js";
import { writeGoogleSheetAction } from "./flow-activities/write-google-sheet-action.js";

import type { CreateFlowActivities } from "@local/hash-backend-utils/flows";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { AiFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

export const createFlowActionActivities: CreateFlowActivities<
  AiFlowActionDefinitionId
> = ({ vaultClient }: { vaultClient: VaultClient }) =>
  wrapFlowActionActivities<AiFlowActionDefinitionId>({
    aggregateAction,
    analyzeEntityDataAction,
    generateStructuralQueryAction,
    answerQuestionAction,
    createEntityAction,
    draftMessageAction,
    filterListAction,
    findAction,
    generateChartConfigAction,
    planDashboardRefinementAction,
    generateWebQueriesAction,
    getFileFromUrlAction,
    getWebPageByUrlAction,
    getWebPageSummaryAction,
    ifAction,
    inferEntitiesFromContentAction,
    inferMetadataFromDocumentAction,
    orderByAction,
    persistEntitiesAction,
    persistEntityAction,
    processAutomaticBrowsingSettingsAction,
    queryEntitiesAction,
    researchEntitiesAction,
    takeFirstAction,
    updateEntityAction,
    webSearchAction,
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
