import type { EntityUuid } from "@blockprotocol/type-system";

import type {
  InputNameForIntegrationFlowAction,
  IntegrationFlowActionDefinitionId,
  OutputNameForIntegrationFlowAction,
} from "./action-definitions.js";
import type { FlowDefinition } from "./types.js";

/**
 * Flow definition for fetching scheduled flights for an airport on a given date and persisting them to the graph.
 */
export const scheduledFlightsFlowDefinition: FlowDefinition<IntegrationFlowActionDefinitionId> =
  {
    name: "Get Scheduled Flights",
    type: "integration",
    flowDefinitionId: "scheduled-flights" as EntityUuid,
    description:
      "Fetch scheduled flight arrivals for an airport on a given date and save them to a web.",
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
          payloadKind: "Text",
          name: "Date",
          array: false,
          required: true,
        },
      ],
    },
    steps: [
      {
        stepId: "1",
        kind: "action",
        actionDefinitionId: "getScheduledFlights",
        description:
          "Fetch scheduled flight arrivals from AeroAPI for the specified airport and date",
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
        kind: "action",
        description:
          "Save discovered flight entities and relationships to HASH graph",
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
    ],
    outputs: [
      {
        stepId: "2",
        stepOutputName:
          "persistedEntities" satisfies OutputNameForIntegrationFlowAction<"persistIntegrationEntities">,
        payloadKind: "PersistedEntities",
        name: "persistedEntities" as const,
        array: false,
        required: true,
      },
    ],
  };
