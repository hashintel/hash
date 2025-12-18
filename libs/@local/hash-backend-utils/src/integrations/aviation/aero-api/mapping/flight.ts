import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import type { AeroApiScheduledFlight } from "../client/types.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

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
 *
 * Note: AeroAPI provides rich data including:
 * - ICAO/IATA flight identifiers
 * - ATC callsign
 * - Flight type
 * - Codeshares
 * - Detailed timestamps (handled by link mappings)
 *
 * Departure and arrival details (times, gates, runways) are mapped
 * via the departsFrom and arrivesAt link mappers.
 */
export const mapFlight: MappingFunction<AeroApiFlightInput, HashFlight> = (
  input: AeroApiFlightInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const flightDate = extractFlightDate(input);
  const flightStatus = deriveFlightStatus(input);

  // Build codeshares array from both ICAO and IATA codes
  const codeshares: Array<{
    "https://hash.ai/@h/types/property-type/icao-code/"?: {
      value: string;
      metadata: {
        dataTypeId: string;
        provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
      };
    };
    "https://hash.ai/@h/types/property-type/iata-code/"?: {
      value: string;
      metadata: {
        dataTypeId: string;
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
        value: input.flight_number ?? input.ident,
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
      ...(input.atc_ident && {
        "https://hash.ai/@h/types/property-type/callsign/": {
          value: input.atc_ident,
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
      ...(flightDate && {
        "https://hash.ai/@h/types/property-type/flight-date/": {
          value: flightDate,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
            provenance,
          },
        },
      }),
      ...(codeshares.length > 0 && {
        "https://hash.ai/@h/types/property-type/codeshare/": {
          value: codeshares.map((codeshare) => ({ value: codeshare })),
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            provenance,
          },
        },
      }),
    },
  };

  const primaryKey = generatePrimaryKey.flight({
    "https://hash.ai/@h/types/property-type/icao-code/":
      input.ident_icao ?? undefined,
    "https://hash.ai/@h/types/property-type/flight-number/":
      input.flight_number ?? input.ident,
    "https://hash.ai/@h/types/property-type/flight-date/":
      flightDate ?? undefined,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
      properties,
    },
  };
};
