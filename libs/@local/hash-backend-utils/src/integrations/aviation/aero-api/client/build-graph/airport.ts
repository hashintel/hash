import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Airport as HashAirport } from "@local/hash-isomorphic-utils/system-types/shared";

import { generatePrimaryKey } from "../../../shared/primary-keys.js";
import type { AeroApiAirport } from "../types.js";
import type { MappingFunction } from "./mapping-types.js";

export type AeroApiAirportInput = AeroApiAirport;

/**
 * Maps AeroAPI airport data to a HASH Airport entity.
 */
export const mapAirport: MappingFunction<AeroApiAirportInput, HashAirport> = (
  input: AeroApiAirportInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const primaryKey = generatePrimaryKey.airport({
    icaoCode: input.code_icao,
  });

  if (!primaryKey) {
    return null;
  }

  const properties: HashAirport["propertiesWithMetadata"] = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: input.name,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/icao-code/": {
        value: input.code_icao!,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      ...(input.code_iata && {
        "https://hash.ai/@h/types/property-type/iata-code/": {
          value: input.code_iata,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.timezone && {
        "https://hash.ai/@h/types/property-type/timezone/": {
          value: input.timezone,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.city && {
        "https://hash.ai/@h/types/property-type/city/": {
          value: input.city,
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
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
      properties,
    },
  };
};
