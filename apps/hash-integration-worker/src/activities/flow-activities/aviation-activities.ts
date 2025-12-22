import { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";

export { getScheduledFlightsAction } from "./aviation-activities/get-scheduled-flights-action.js";
export { createPersistIntegrationEntitiesAction as createPersistFlightEntitiesAction } from "./integration-activities/persist-integration-entities-action.js";

/**
 * Creates the aviation flow action activities.
 *
 * @param graphApiClient - The GraphApi client for persisting entities
 * @returns An object containing the aviation flow activities
 */
export const createAviationActivities = () => ({
  /**
   * Fetches scheduled flights from AeroAPI and returns them as ProposedEntity objects.
   * This activity doesn't require a graph client since it only fetches data.
   */
  getScheduledFlightsAction,
});
