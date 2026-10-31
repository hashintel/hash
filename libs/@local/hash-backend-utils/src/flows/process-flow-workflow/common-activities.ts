import {
  saveOpenInputRequests,
  type SaveOpenInputRequestsParams,
} from "../shared/save-open-input-requests.js";
import {
  getFlowDefinitionActivity,
  type GetFlowDefinitionActivityParams,
} from "./common-activities/get-flow-definition-activity.js";
import {
  persistFlowActivity,
  type PersistFlowActivityParams,
} from "./common-activities/persist-flow-activity.js";
import {
  recordFlowRunActivity,
  type RecordFlowRunActivityParams,
} from "./common-activities/record-flow-run-activity.js";
import {
  userHasPermissionToRunFlowInWebActivity,
  type UserHasPermissionToRunFlowInWebActivityParams,
} from "./common-activities/user-has-permission-to-run-flow-in-web-activity.js";

import type { GraphApi } from "@local/hash-graph-client";

export const createCommonFlowActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  getFlowDefinitionActivity(params: GetFlowDefinitionActivityParams) {
    return getFlowDefinitionActivity({
      graphApiClient,
      ...params,
    });
  },
  userHasPermissionToRunFlowInWebActivity(
    params: UserHasPermissionToRunFlowInWebActivityParams,
  ) {
    return userHasPermissionToRunFlowInWebActivity({
      graphApiClient,
      ...params,
    });
  },
  persistFlowActivity(params: PersistFlowActivityParams) {
    return persistFlowActivity({
      graphApiClient,
      ...params,
    });
  },
  recordFlowRunActivity(params: RecordFlowRunActivityParams) {
    return recordFlowRunActivity({
      graphApiClient,
      ...params,
    });
  },
  saveOpenInputRequestsActivity(params: SaveOpenInputRequestsParams) {
    return saveOpenInputRequests({
      graphApiClient,
      ...params,
    });
  },
});
