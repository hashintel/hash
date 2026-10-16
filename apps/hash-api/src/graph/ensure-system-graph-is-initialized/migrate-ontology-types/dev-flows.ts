import {
  historicalFlightsFlow,
  scheduledFlightsFlow,
} from "@local/hash-isomorphic-utils/flows/integration-flow-definitions";

import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The flows that only exist in development, because they use types that only dev migrations create,
 *
 * They are seeded from this code each time the API starts in development or test mode.
 * When the flow definition is changed the flow will be updated in place automatically
 * when the API next starts.
 */
export const devFlows: FlowDefinitionWithId[] = [
  historicalFlightsFlow,
  scheduledFlightsFlow,
];
