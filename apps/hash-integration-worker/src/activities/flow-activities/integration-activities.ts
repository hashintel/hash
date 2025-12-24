import type { GraphApi } from "@local/hash-graph-client";

import { createPersistIntegrationEntitiesAction } from "./integration-activities/persist-integration-entities-action.js";

export const createIntegrationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  persistIntegrationEntitiesAction: createPersistIntegrationEntitiesAction({
    graphApiClient,
  }),
});
