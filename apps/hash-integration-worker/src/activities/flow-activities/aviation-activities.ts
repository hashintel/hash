import { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";

export { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";
export { createPersistIntegrationEntitiesAction as createPersistFlightEntitiesAction } from "./integration-activities/persist-integration-entities-action.js";

/**
 * Creates the aviation flow action activities.
 */
export const createAviationActivities = () => ({
  /**
   * Fetches scheduled flights from AeroAPI and returns them as ProposedEntity objects.
   */
  getScheduledFlightsAction,
});
