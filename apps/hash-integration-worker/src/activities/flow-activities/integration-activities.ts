import { createPersistIntegrationEntitiesAction } from "./integration-activities/persist-integration-entities-action.js";

import type { GraphApi } from "@local/hash-graph-client";

export const createIntegrationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  persistIntegrationEntitiesAction: createPersistIntegrationEntitiesAction({
    graphApiClient,
  }),
});
