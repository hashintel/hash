import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import { generatePrimaryKey } from "../../../shared/primary-keys.js";
import type { AeroApiScheduledFlight } from "../types.js";
import type { MappingFunction } from "./mapping-types.js";

export type AeroApiFlightInput = AeroApiScheduledFlight;

/**
 * Derives a HASH flight status from AeroAPI flight data.
 */
const deriveFlightStatus = (
  flight: AeroApiScheduledFlight,
): "Scheduled" | "Active" | "Landed" | "Cancelled" | "Diverted" | undefined => {
  if (flight.cancelled) {
    return "Cancelled";
  }
  if (flight.diverted) {
    return "Diverted";
  }
  if (flight.actual_on) {
    return "Landed";
  }
  if (flight.actual_off || flight.actual_out) {
    return "Active";
  }
  if (flight.scheduled_out || flight.scheduled_off) {
    return "Scheduled";
  }
  return undefined;
};

/**
 * Extracts flight date from the earliest available timestamp.
 */
const extractFlightDate = (flight: AeroApiScheduledFlight): string | null => {
  const timestamp =
    flight.scheduled_out ??
    flight.scheduled_off ??
    flight.estimated_out ??
    flight.estimated_off ??
    flight.actual_out ??
    flight.actual_off;

  if (!timestamp) {
    return null;
  }

  return timestamp.split("T")[0] ?? null;
};

/**
 * Maps AeroAPI scheduled flight data to a HASH Flight entity.
 * Returns `null` if flight number or date is missing.
 *
 * Departure and arrival details (times, gates, runways) are presented on the ArrivesAt and DepartsFrom link entities.
 */
export const mapFlight: MappingFunction<AeroApiFlightInput, HashFlight> = (
  input: AeroApiFlightInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const flightDate = extractFlightDate(input);

  /**
   * The 2 letter IATA code of the airline and the flight number.
   * This is the flight number presented to consumers, and also that used by the flightradar24 API.
   * Standardising on this allows us to use the same primary key and reliably identify the same flight across sources.
   */
  const flightNumber =
    input.operator_iata && input.flight_number
      ? `${input.operator_iata}${input.flight_number}`
      : null;

  const primaryKey = generatePrimaryKey.flight({
    flightNumber,
    flightDate,
  });

  if (!primaryKey || !flightNumber) {
    return null;
  }

  const flightStatus = deriveFlightStatus(input);

  // Build codeshares array from both ICAO and IATA codes
  const codeshares: Array<{
    "https://hash.ai/@h/types/property-type/icao-code/"?: {
      value: string;
      metadata: {
        dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
        provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
      };
    };
    "https://hash.ai/@h/types/property-type/iata-code/"?: {
      value: string;
      metadata: {
        dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
        provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
      };
    };
  }> = [];

  // Pair ICAO and IATA codeshares (they should be in matching order)
  const maxCodeshares = Math.max(
    input.codeshares.length,
    input.codeshares_iata.length,
  );
  for (let i = 0; i < maxCodeshares; i++) {
    const icaoCode = input.codeshares[i];
    const iataCode = input.codeshares_iata[i];

    if (icaoCode || iataCode) {
      codeshares.push({
        ...(icaoCode && {
          "https://hash.ai/@h/types/property-type/icao-code/": {
            value: icaoCode,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              provenance,
            },
          },
        }),
        ...(iataCode && {
          "https://hash.ai/@h/types/property-type/iata-code/": {
            value: iataCode,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              provenance,
            },
          },
        }),
      });
    }
  }

  const properties: HashFlight["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/flight-number/": {
        value: flightNumber,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      ...(input.ident_icao && {
        "https://hash.ai/@h/types/property-type/icao-code/": {
          value: input.ident_icao,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.ident_iata && {
        "https://hash.ai/@h/types/property-type/iata-code/": {
          value: input.ident_iata,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.type && {
        "https://hash.ai/@h/types/property-type/flight-type/": {
          value: input.type,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(flightStatus && {
        "https://hash.ai/@h/types/property-type/flight-status/": {
          value: flightStatus,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/flight-status/v/1",
            provenance,
          },
        },
      }),
      "https://hash.ai/@h/types/property-type/flight-date/": {
        value: flightDate!,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
          provenance,
        },
      },
      ...(codeshares.length > 0 && {
        "https://hash.ai/@h/types/property-type/codeshare/": {
          value: codeshares.map((codeshare) => ({ value: codeshare })),
        },
      }),
    },
  };

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
      properties,
    },
  };
};
