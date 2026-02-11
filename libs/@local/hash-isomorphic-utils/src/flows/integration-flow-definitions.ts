import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  InputNameForIntegrationFlowAction,
  IntegrationFlowActionDefinitionId,
  OutputNameForIntegrationFlowAction,
} from "./action-definitions.js";
import type { FlowDefinition } from "./types.js";

/**
 * Flow definition for fetching historical flight arrivals for an airport over a date range and persisting them to the graph.
 */
export const historicalFlightsFlowDefinition: FlowDefinition<IntegrationFlowActionDefinitionId> =
  {
    name: "Get Historical Flights",
    type: "integration",
    flowDefinitionId: "historical-flights" as EntityUuid,
    groups: [
      {
        groupId: 1,
        description: "Retrieve and save historical flights",
      },
    ],
    description:
      "Fetch and save historical flight arrivals for an airport over a date range.",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User provides an airport ICAO code and date range to fetch historical flights for",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "Airport ICAO",
          array: false,
          required: true,
        },
        {
          payloadKind: "Date",
          name: "Start Date",
          array: false,
          required: true,
        },
        {
          payloadKind: "Date",
          name: "End Date",
          array: false,
          required: true,
        },
      ],
    },
    steps: [
      {
        stepId: "1",
        groupId: 1,
        kind: "action",
        actionDefinitionId: "getHistoricalFlightArrivals",
        description:
          "Fetch historical flight arrivals for the specified airport and date range",
        inputSources: [
          {
            inputName:
              "airportIcao" satisfies InputNameForIntegrationFlowAction<"getHistoricalFlightArrivals">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Airport ICAO",
          },
          {
            inputName:
              "startDate" satisfies InputNameForIntegrationFlowAction<"getHistoricalFlightArrivals">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Start Date",
          },
          {
            inputName:
              "endDate" satisfies InputNameForIntegrationFlowAction<"getHistoricalFlightArrivals">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "End Date",
          },
        ],
      },
      {
        stepId: "2",
        groupId: 1,
        kind: "action",
        description: "Save discovered entities and relationships to HASH graph",
        actionDefinitionId: "persistIntegrationEntities",
        inputSources: [
          {
            inputName:
              "proposedEntities" satisfies InputNameForIntegrationFlowAction<"persistIntegrationEntities">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "proposedEntities" satisfies OutputNameForIntegrationFlowAction<"getHistoricalFlightArrivals">,
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "2",
        stepOutputName:
          "persistedEntities" satisfies OutputNameForIntegrationFlowAction<"persistIntegrationEntities">,
        payloadKind: "PersistedEntitiesMetadata",
        name: "persistedEntities" as const,
        array: false,
        required: true,
      },
    ],
  };

/**
 * Flow definition for fetching scheduled flights for an airport on a given date and persisting them to the graph.
 */
export const scheduledFlightsFlowDefinition: FlowDefinition<IntegrationFlowActionDefinitionId> =
  {
    name: "Get Scheduled Flights",
    type: "integration",
    flowDefinitionId: "scheduled-flights" as EntityUuid,
    groups: [
      {
        groupId: 1,
        description: "Retrieve and save scheduled flights",
      },
      {
        groupId: 2,
        description: "Retrieve and save live flight positions",
      },
    ],
    description:
      "Fetch and save scheduled flight arrivals for an airport on a given date, with position updates for live flights.",
    trigger: {
      triggerDefinitionId: "userTrigger",
      description:
        "User provides an airport ICAO code and date to fetch scheduled flights for",
      kind: "trigger",
      outputs: [
        {
          payloadKind: "Text",
          name: "Airport ICAO",
          array: false,
          required: true,
        },
        {
          payloadKind: "Date",
          name: "Date",
          array: false,
          required: true,
        },
      ],
    },
    steps: [
      {
        stepId: "1",
        groupId: 1,
        kind: "action",
        actionDefinitionId: "getScheduledFlights",
        description:
          "Fetch scheduled flight arrivals from for the specified airport and date",
        inputSources: [
          {
            inputName:
              "airportIcao" satisfies InputNameForIntegrationFlowAction<"getScheduledFlights">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Airport ICAO",
          },
          {
            inputName:
              "date" satisfies InputNameForIntegrationFlowAction<"getScheduledFlights">,
            kind: "step-output",
            sourceStepId: "trigger",
            sourceStepOutputName: "Date",
          },
        ],
      },
      {
        stepId: "2",
        groupId: 1,
        kind: "action",
        description: "Save discovered entities and relationships to HASH graph",
        actionDefinitionId: "persistIntegrationEntities",
        inputSources: [
          {
            inputName:
              "proposedEntities" satisfies InputNameForIntegrationFlowAction<"persistIntegrationEntities">,
            kind: "step-output",
            sourceStepId: "1",
            sourceStepOutputName:
              "proposedEntities" satisfies OutputNameForIntegrationFlowAction<"getScheduledFlights">,
          },
        ],
      },
      {
        stepId: "3",
        groupId: 2,
        kind: "action",
        actionDefinitionId: "getLiveFlightPositions",
        description: "Fetch current position of active flights",
        inputSources: [
          {
            inputName:
              "persistedEntities" satisfies InputNameForIntegrationFlowAction<"getLiveFlightPositions">,
            kind: "step-output",
            sourceStepId: "2",
            sourceStepOutputName:
              "persistedEntities" satisfies OutputNameForIntegrationFlowAction<"persistIntegrationEntities">,
          },
        ],
      },
      {
        stepId: "4",
        groupId: 2,
        kind: "action",
        description: "Save live flight position updates to HASH graph",
        actionDefinitionId: "persistIntegrationEntities",
        inputSources: [
          {
            inputName:
              "proposedEntities" satisfies InputNameForIntegrationFlowAction<"persistIntegrationEntities">,
            kind: "step-output",
            sourceStepId: "3",
            sourceStepOutputName:
              "proposedEntities" satisfies OutputNameForIntegrationFlowAction<"getLiveFlightPositions">,
          },
        ],
      },
    ],
    outputs: [
      {
        stepId: "4",
        stepOutputName:
          "persistedEntities" satisfies OutputNameForIntegrationFlowAction<"persistIntegrationEntities">,
        payloadKind: "PersistedEntitiesMetadata",
        name: "persistedEntities" as const,
        array: false,
        required: true,
      },
    ],
  };
