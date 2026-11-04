import { wrapFlowActionActivities } from "@local/hash-backend-utils/flows/wrap-flow-action-activities";

import { createAviationActivities } from "./flow-activities/aviation-activities.js";
import { createIntegrationActivities } from "./flow-activities/integration-activities.js";

import type { CreateFlowActivities } from "@local/hash-backend-utils/flows";
import type { GraphApi } from "@local/hash-graph-client";
import type { IntegrationFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

export const createFlowActivities: CreateFlowActivities<
  IntegrationFlowActionDefinitionId
> = ({ graphApiClient }: { graphApiClient: GraphApi }) =>
  wrapFlowActionActivities<IntegrationFlowActionDefinitionId>({
    ...createAviationActivities({ graphApiClient }),
    ...createIntegrationActivities({ graphApiClient }),
  });
