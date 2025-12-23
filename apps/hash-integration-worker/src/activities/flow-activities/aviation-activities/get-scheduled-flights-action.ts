import {
  type EntityId,
  extractBaseUrl,
  type OriginProvenance,
  type ProvidedEntityEditionProvenance,
} from "@blockprotocol/type-system";
import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type { AviationProposedEntity } from "@local/hash-backend-utils/integrations/aviation";
import { getScheduledArrivalEntities } from "@local/hash-backend-utils/integrations/aviation";
import { getSimplifiedIntegrationFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { StatusCode } from "@local/status";

import { splitPropertiesAndMetadata } from "../shared/split-properties-and-metadata.js";

/**
 * Converts an {@link AviationProposedEntity} to a flow {@link ProposedEntity} format.
 *
 * This handles splitting propertiesWithMetadata into properties and propertyMetadata,
 * and converts link entities by adding sourceEntityId and targetEntityId.
 *
 * @todo we should just pass the propertiesWithMetadata around everywhere, but the existing PersistedEntity format has them split
 *       – they then get merged again anyway to persist to the Graph. Worth refactoring at some point.
 */
export const aviationProposedEntityToFlowProposedEntity = (
  entity: AviationProposedEntity,
  provenance: ProvidedEntityEditionProvenance,
): ProposedEntity => {
  const { properties, propertyMetadata } = splitPropertiesAndMetadata(
    entity.properties,
  );

  const flowEntity: ProposedEntity = {
    claims: {
      isSubjectOf: [],
      isObjectOf: [],
    },
    provenance,
    propertyMetadata,
    localEntityId: entity.localEntityId as EntityId,
    entityTypeIds: entity.entityTypeIds,
    properties,
  };

  return flowEntity;
};

/**
 * Fetches scheduled flights from AeroAPI for a given airport and date and returns them as ProposedEntity objects.
 */
export const getScheduledFlightsAction: FlowActionActivity = async ({
  inputs,
}) => {
  try {
    const { airportIcao, date } = getSimplifiedIntegrationFlowActionInputs({
      inputs,
      actionType: "getScheduledFlights",
    });

    const { entities, provenance } = await getScheduledArrivalEntities(
      airportIcao,
      date,
    );

    const fullProvenance = {
      ...provenance,
      actorType: "machine" as const,
      origin: {
        type: "flow",
        id: "aviation-integration",
      } satisfies OriginProvenance,
    };

    const proposedEntities: ProposedEntity[] = [];

    let flightCount = 0;
    for (const entity of entities.values()) {
      if (
        entity.entityTypeIds.some(
          (entityTypeId) =>
            extractBaseUrl(entityTypeId) ===
            systemEntityTypes.flight.entityTypeBaseUrl,
        )
      ) {
        flightCount++;
      }

      proposedEntities.push(
        aviationProposedEntityToFlowProposedEntity(entity, fullProvenance),
      );
    }

    return {
      code: StatusCode.Ok,
      message: `Generated ${flightCount} flights and ${entities.size - flightCount} related entities for ${airportIcao} on ${date}`,
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
      message: `Failed to fetch scheduled flights: ${errorMessage}`,
      contents: [],
    };
  }
};
