import type { GraphApi } from "@local/hash-graph-client";

import {
  persistFlowActivity,
  type PersistFlowActivityParams,
} from "./common-activities/persist-flow-activity.js";
import {
  userHasPermissionToRunFlowInWebActivity,
  type UserHasPermissionToRunFlowInWebActivityParams,
} from "./common-activities/user-has-permission-to-run-flow-in-web-activity.js";

export const createCommonFlowActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
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
});
