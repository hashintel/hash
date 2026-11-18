import { typedActionDefinitions as actions } from "../action-definitions.js";
import { defineFlow, flowInput } from "../define-flow.js";
import { flowDefinitionIds } from "../flow-definition-ids.js";

/**
 * Flow for fetching historical flight arrivals for an airport over a date range and persisting them to the graph.
 */
export const historicalFlightsFlow = defineFlow(
  {
    flowDefinitionId: flowDefinitionIds.historicalFlights,
    name: "Get Historical Flights",
    description:
      "Fetch and save historical flight arrivals for an airport over a date range.",
    inputs: {
      airportIcao: flowInput("Text", { label: "Airport ICAO" }),
      startDate: flowInput("Date", { label: "Start Date" }),
      endDate: flowInput("Date", { label: "End Date" }),
    },
  },
  ({ inputs, step }) => {
    const arrivals = step("1", actions.getHistoricalFlightArrivals, {
      description:
        "Fetch historical flight arrivals for the specified airport and date range",
      inputs: {
        airportIcao: inputs.airportIcao,
        startDate: inputs.startDate,
        endDate: inputs.endDate,
      },
    });

    const persist = step("2", actions.persistIntegrationEntities, {
      description: "Save discovered entities and relationships to HASH graph",
      inputs: { proposedEntities: arrivals.outputs.proposedEntities },
    });

    return {
      outputs: {
        persistedEntities: persist.outputs.persistedEntities,
        failedEntityProposals: persist.outputs.failedEntityProposals,
      },
    };
  },
);

/**
 * Flow for fetching scheduled flights for an airport on a given date and persisting them to the graph.
 */
export const scheduledFlightsFlow = defineFlow(
  {
    flowDefinitionId: flowDefinitionIds.scheduledFlights,
    name: "Get Scheduled Flights",
    description:
      "Fetch and save scheduled flight arrivals for an airport on a given date, with position updates for live flights.",
    inputs: {
      airportIcao: flowInput("Text", { label: "Airport ICAO" }),
      date: flowInput("Date", { label: "Date" }),
    },
  },
  ({ inputs, step }) => {
    const scheduledFlights = step("1", actions.getScheduledFlights, {
      description:
        "Fetch scheduled flight arrivals from for the specified airport and date",
      inputs: { airportIcao: inputs.airportIcao, date: inputs.date },
    });

    const persistFlights = step("2", actions.persistIntegrationEntities, {
      description: "Save discovered entities and relationships to HASH graph",
      inputs: { proposedEntities: scheduledFlights.outputs.proposedEntities },
    });

    const livePositions = step("3", actions.getLiveFlightPositions, {
      description: "Fetch current position of active flights",
      inputs: { persistedEntities: persistFlights.outputs.persistedEntities },
    });

    const persistPositions = step("4", actions.persistIntegrationEntities, {
      description: "Save live flight position updates to HASH graph",
      inputs: { proposedEntities: livePositions.outputs.proposedEntities },
    });

    return {
      outputs: {
        persistedEntities: persistPositions.outputs.persistedEntities,
        failedEntityProposals: persistPositions.outputs.failedEntityProposals,
      },
    };
  },
);
