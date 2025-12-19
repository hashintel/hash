import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Aircraft as HashAircraft } from "@local/hash-isomorphic-utils/system-types/shared";

import { generatePrimaryKey } from "../../../shared/primary-keys.js";
import type { AeroApiScheduledFlight } from "../types.js";
import type { MappingFunction } from "./mapping-types.js";

/**
 * Input type for aircraft mapping from AeroAPI data.
 */
export type AeroApiAircraftInput = Pick<
  AeroApiScheduledFlight,
  "registration" | "aircraft_type"
>;

/**
 * Maps AeroAPI aircraft data to a HASH Aircraft entity.
 * Returns `null` if registration number is missing.
 *
 * AeroAPI provides:
 * - registration: Aircraft registration number (e.g., "G-XLEA") – but sometimes missing
 * - aircraft_type: ICAO aircraft type code (e.g., "A388" for Airbus A380-800) - not yet encountered missing
 */
export const mapAircraft: MappingFunction<
  AeroApiAircraftInput,
  HashAircraft
> = (
  input: AeroApiAircraftInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const registration = input.registration?.trim();

  const primaryKey = generatePrimaryKey.aircraft({
    registrationNumber: registration,
  });

  if (!primaryKey || !registration) {
    return null;
  }

  const properties: HashAircraft["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/registration-number/": {
        value: registration,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      ...(input.aircraft_type && {
        "https://hash.ai/@h/types/property-type/icao-code/": {
          value: input.aircraft_type,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
    },
  };

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/aircraft/v/1"],
      properties,
    },
  };
};
