import type { GraphApi } from "@local/hash-graph-client";

import { createGetLiveFlightPositionsAction } from "./aviation-activities/get-live-flight-positions-action.js";
import { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";

export { createGetLiveFlightPositionsAction } from "./aviation-activities/get-live-flight-positions-action.js";
export { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";
export { createPersistIntegrationEntitiesAction as createPersistFlightEntitiesAction } from "./integration-activities/persist-integration-entities-action.js";

/**
 * Creates the aviation flow action activities.
 */
export const createAviationActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  /**
   * Fetches scheduled flights from AeroAPI and returns them as ProposedEntity objects.
   */
  getScheduledFlightsAction,
  /**
   * Fetches live flight positions from FlightRadar24 for flights that have departed.
   */
  getLiveFlightPositionsAction: createGetLiveFlightPositionsAction({
    graphApiClient,
  }),
});
