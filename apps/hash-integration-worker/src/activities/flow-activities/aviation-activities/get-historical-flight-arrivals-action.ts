import {
  extractBaseUrl,
  type OriginProvenance,
} from "@blockprotocol/type-system";
import type { IntegrationFlowActionActivity } from "@local/hash-backend-utils/flows";
import {
  getStorageProvider,
  storePayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getHistoricalArrivalEntities } from "@local/hash-backend-utils/integrations/aviation";
import { getSimplifiedIntegrationFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-integration-flow-context.js";
import { aviationProposedEntityToFlowProposedEntity } from "./get-scheduled-flights-action.js";

/**
 * Validates that the end date is yesterday or earlier.
 * Historical flight data is only available for completed flights.
 */
const validateEndDate = (endDate: string): void => {
  const endDateObj = new Date(`${endDate}T23:59:59Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (endDateObj >= today) {
    throw new Error(
      `End date must be yesterday or earlier. Received: ${endDate}`,
    );
  }
};

/**
 * Validates that the start date is not after the end date.
 */
const validateDateRange = (startDate: string, endDate: string): void => {
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  if (startDateObj > endDateObj) {
    throw new Error(
      `Start date (${startDate}) cannot be after end date (${endDate})`,
    );
  }
};

/**
 * Fetches historical arrival flights from AeroAPI for a given airport and date range
 * and returns them as ProposedEntity objects.
 */
export const getHistoricalFlightArrivalsAction: IntegrationFlowActionActivity<
  "getHistoricalFlightArrivals"
> = async ({ inputs }) => {
  try {
    const { airportIcao, startDate, endDate } =
      getSimplifiedIntegrationFlowActionInputs({
        inputs,
        actionType: "getHistoricalFlightArrivals",
      });

    // Validate inputs
    validateEndDate(endDate);
    validateDateRange(startDate, endDate);

    const { entities, provenance } = await getHistoricalArrivalEntities(
      airportIcao,
      startDate,
      endDate,
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

    // Store the proposed entities in S3 to avoid passing large payloads through Temporal
    const { workflowId, runId, stepId } = await getFlowContext();

    const storedRef = await storePayload({
      storageProvider: getStorageProvider(),
      workflowId,
      runId,
      stepId,
      outputName: "proposedEntities",
      kind: "ProposedEntity",
      value: proposedEntities,
    });

    return {
      code: StatusCode.Ok,
      message: `Generated ${flightCount} flights and ${entities.size - flightCount} related entities for ${airportIcao} from ${startDate} to ${endDate}`,
      contents: [
        {
          outputs: [
            {
              outputName: "proposedEntities",
              payload: {
                kind: "ProposedEntity",
                value: storedRef,
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
      message: `Failed to fetch historical flight arrivals: ${errorMessage}`,
      contents: [],
    };
  }
};
