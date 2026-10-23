import { signalStepAttempts } from "@local/hash-backend-utils/flows/signal-step-attempts";

import { createAviationActivities } from "./flow-activities/aviation-activities.js";
import { createIntegrationActivities } from "./flow-activities/integration-activities.js";

import type { CreateFlowActivities } from "@local/hash-backend-utils/flows";
import type { GraphApi } from "@local/hash-graph-client";
import type { IntegrationFlowActionDefinitionId } from "@local/hash-isomorphic-utils/flows/action-definitions";

export const createFlowActivities: CreateFlowActivities<
  IntegrationFlowActionDefinitionId
> = ({ graphApiClient }: { graphApiClient: GraphApi }) =>
  signalStepAttempts({
    ...createAviationActivities({ graphApiClient }),
    ...createIntegrationActivities({ graphApiClient }),
  });
