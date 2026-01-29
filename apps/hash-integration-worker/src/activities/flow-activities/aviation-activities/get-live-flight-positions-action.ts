import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import {
  type EntityId,
  extractEntityUuidFromEntityId,
  type LinkEntity,
  type OriginProvenance,
  type ProvidedEntityEditionProvenance,
} from "@blockprotocol/type-system";
import type { IntegrationFlowActionActivity } from "@local/hash-backend-utils/flows";
import { getFlightPositionProperties } from "@local/hash-backend-utils/integrations/aviation/flightradar24/client";
import type { PrimaryKeyInput } from "@local/hash-backend-utils/integrations/aviation/shared/primary-keys";
import type { GraphApi } from "@local/hash-graph-client";
import { queryEntitySubgraph } from "@local/hash-graph-sdk/entity";
import { getSimplifiedIntegrationFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  type ArrivesAt,
  type ArrivesAtProperties,
  type DepartsFrom,
  type DepartsFromProperties,
  type Flight,
} from "@local/hash-isomorphic-utils/system-types/flight";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-integration-flow-context.js";
import { splitPropertiesAndMetadata } from "../shared/split-properties-and-metadata.js";

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Determines if a flight should have its live position fetched based on:
 * 1. Expected departure time has passed
 * 2. There is no confirmed arrival time, or confirmed arrival time was in the last 10 minutes
 */
const shouldFetchLivePosition = (
  departsFromProperties: DepartsFromProperties,
  arrivesAtProperties: ArrivesAtProperties,
): boolean => {
  // Get departure time - prefer estimated, fall back to scheduled
  const actualDepartureTime =
    departsFromProperties[
      "https://hash.ai/@h/types/property-type/actual-gate-time/"
    ];
  const estimatedDepartureTime =
    departsFromProperties[
      "https://hash.ai/@h/types/property-type/estimated-gate-time/"
    ];
  const scheduledDepartureTime =
    departsFromProperties[
      "https://hash.ai/@h/types/property-type/scheduled-gate-time/"
    ];

  const expectedDepartureTime =
    actualDepartureTime ?? estimatedDepartureTime ?? scheduledDepartureTime;

  const actualArrivalTime =
    arrivesAtProperties[
      "https://hash.ai/@h/types/property-type/actual-gate-time/"
    ];

  const now = Date.now();

  // Check condition 1: Expected departure time has passed
  const departureHasPassed =
    expectedDepartureTime && new Date(expectedDepartureTime).getTime() < now;

  // Check condition 2: No confirmed arrival, or arrival was in last 10 minutes
  const noConfirmedArrival = !actualArrivalTime;
  const arrivedInLastTenMinutes =
    actualArrivalTime &&
    now - new Date(actualArrivalTime).getTime() < TEN_MINUTES_MS;

  return Boolean(
    departureHasPassed && (noConfirmedArrival || arrivedInLastTenMinutes),
  );
};

/**
 * Creates the get live flight positions action that fetches live positions
 * for flights that have departed or recently arrived.
 */
export const createGetLiveFlightPositionsAction = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}): IntegrationFlowActionActivity<"getLiveFlightPositions"> => {
  return async ({ inputs }) => {
    try {
      const { userAuthentication } = await getFlowContext();

      const { persistedEntities } = getSimplifiedIntegrationFlowActionInputs({
        inputs,
        actionType: "getLiveFlightPositions",
      });

      const flightEntityIds = persistedEntities.persistedEntities.map(
        ({ entityId }) => entityId,
      );

      if (flightEntityIds.length === 0) {
        return {
          code: StatusCode.Ok,
          message: "No persisted entities to check for live positions",
          contents: [
            {
              outputs: [
                {
                  outputName: "proposedEntities",
                  payload: {
                    kind: "ProposedEntity",
                    value: [],
                  },
                },
              ],
            },
          ],
        };
      }

      const { subgraph } = await queryEntitySubgraph<Flight>(
        { graphApi: graphApiClient },
        userAuthentication,
        {
          filter: {
            any: flightEntityIds.map((entityId) => ({
              equal: [
                { path: ["uuid"] },
                { parameter: extractEntityUuidFromEntityId(entityId) },
              ],
            })),
          },
          traversalPaths: [
            {
              edges: [
                {
                  kind: "has-left-entity",
                  direction: "incoming",
                },
              ],
            },
          ],
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      );

      const rootEntities = getRoots(subgraph);

      const flightsToUpdate: Array<{
        entityId: EntityId;
        flightNumber: string;
        primaryKeyProperties: PrimaryKeyInput["flight"];
      }> = [];

      for (const entity of rootEntities) {
        const flightNumber =
          entity.properties[
            "https://hash.ai/@h/types/property-type/flight-number/"
          ];

        if (!flightNumber) {
          continue;
        }

        const outgoingLinks = getOutgoingLinksForEntity(
          subgraph,
          entity.metadata.recordId.entityId,
        );

        const departsFromLink = outgoingLinks.find(
          (link): link is LinkEntity<DepartsFrom> =>
            link.metadata.entityTypeIds.includes(
              systemLinkEntityTypes.departsFrom.linkEntityTypeId,
            ),
        );

        const arrivesAtLink = outgoingLinks.find(
          (link): link is LinkEntity<ArrivesAt> =>
            link.metadata.entityTypeIds.includes(
              systemLinkEntityTypes.arrivesAt.linkEntityTypeId,
            ),
        );

        if (
          departsFromLink &&
          arrivesAtLink &&
          shouldFetchLivePosition(
            departsFromLink.properties,
            arrivesAtLink.properties,
          )
        ) {
          flightsToUpdate.push({
            entityId: entity.metadata.recordId.entityId,
            flightNumber,
            primaryKeyProperties: {
              flightNumber,
              flightDate:
                entity.properties[
                  "https://hash.ai/@h/types/property-type/flight-date/"
                ]!,
            },
          });
        }
      }

      if (flightsToUpdate.length === 0) {
        return {
          code: StatusCode.Ok,
          message: "No flights require live position updates",
          contents: [
            {
              outputs: [
                {
                  outputName: "proposedEntities",
                  payload: {
                    kind: "ProposedEntity",
                    value: [],
                  },
                },
              ],
            },
          ],
        };
      }

      // Fetch live positions for each flight
      const proposedEntities: ProposedEntity[] = [];
      let successCount = 0;
      let notFoundCount = 0;

      const { flowEntityId, stepId } = await getFlowContext();

      const baseProvenance: ProvidedEntityEditionProvenance = {
        actorType: "machine",
        origin: {
          type: "flow",
          id: flowEntityId,
          stepIds: [stepId],
        } satisfies OriginProvenance,
      };

      for (const {
        entityId,
        flightNumber,
        primaryKeyProperties,
      } of flightsToUpdate) {
        const positionData = await getFlightPositionProperties(flightNumber);

        if (!positionData) {
          notFoundCount++;
          continue;
        }

        const { properties, provenance } = positionData;

        const fullProvenance: ProvidedEntityEditionProvenance = {
          ...baseProvenance,
          ...provenance,
        };

        const propertiesWithPrimaryKey: Partial<
          Flight["propertiesWithMetadata"]["value"]
        > = {
          ...properties,
        };

        /**
         * We need the primary key properties passed out of this action,
         * because persistIntegrationEntities relies on them to match existing entities.
         */
        for (const [propertyType, propertyValue] of Object.entries(
          primaryKeyProperties,
        )) {
          switch (propertyType) {
            case "flightNumber":
              propertiesWithPrimaryKey[
                "https://hash.ai/@h/types/property-type/flight-number/"
              ] = {
                value: propertyValue,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  provenance: fullProvenance,
                },
              };
              break;
            case "flightDate":
              propertiesWithPrimaryKey[
                "https://hash.ai/@h/types/property-type/flight-date/"
              ] = {
                value: propertyValue,
                metadata: {
                  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
                  provenance: fullProvenance,
                },
              };
              break;
            default:
              throw new Error(
                `Unhandled primary key property type: ${propertyType}`,
              );
          }
        }

        const { properties: propertiesOnly, propertyMetadata } =
          splitPropertiesAndMetadata({
            value: properties as Flight["propertiesWithMetadata"]["value"],
          });

        const proposedEntity: ProposedEntity = {
          claims: {
            isSubjectOf: [],
            isObjectOf: [],
          },
          provenance: fullProvenance,
          propertyMetadata,
          localEntityId: entityId,
          entityTypeIds: [systemEntityTypes.flight.entityTypeId],
          properties: propertiesOnly,
        };

        proposedEntities.push(proposedEntity);
        successCount++;
      }

      return {
        code: StatusCode.Ok,
        message: `Fetched live positions for ${successCount} flights (${notFoundCount} not found in FlightRadar24)`,
        contents: [
          {
            outputs: [
              {
                outputName: "proposedEntities",
                payload: {
                  kind: "ProposedEntity",
                  value: proposedEntities,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        code: StatusCode.Internal,
        message: `Failed to fetch live flight positions: ${errorMessage}`,
        contents: [],
      };
    }
  };
};
