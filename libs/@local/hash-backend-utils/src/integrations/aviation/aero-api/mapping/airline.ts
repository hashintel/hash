import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Airline as HashAirline } from "@local/hash-isomorphic-utils/system-types/shared";

import type { AeroApiScheduledFlight } from "../client/types.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

/**
 * Input type for airline mapping from AeroAPI data.
 */
export type AeroApiAirlineInput = Pick<
  AeroApiScheduledFlight,
  "operator" | "operator_icao" | "operator_iata"
>;

/**
 * Maps AeroAPI operator data to a HASH Airline entity.
 *
 * Note: AeroAPI provides limited airline data:
 * - operator: Operator code (usually ICAO)
 * - operator_icao: ICAO airline code
 * - operator_iata: IATA airline code
 */
export const mapAirline: MappingFunction<AeroApiAirlineInput, HashAirline> = (
  input: AeroApiAirlineInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  if (!input.operator && !input.operator_icao && !input.operator_iata) {
    throw new Error("At least one operator identifier is required");
  }

  const properties: HashAirline["propertiesWithMetadata"] = {
    value: {
      // Use operator code as name if available, otherwise fall back to ICAO/IATA
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value:
          input.operator ?? input.operator_icao ?? input.operator_iata ?? "",
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      ...(input.operator_icao && {
        "https://hash.ai/@h/types/property-type/icao-code/": {
          value: input.operator_icao,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.operator_iata && {
        "https://hash.ai/@h/types/property-type/iata-code/": {
          value: input.operator_iata,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
    },
  };

  const primaryKey = generatePrimaryKey.airline({
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      input.operator ?? input.operator_icao ?? input.operator_iata ?? "",
    "https://hash.ai/@h/types/property-type/icao-code/":
      input.operator_icao ?? undefined,
    "https://hash.ai/@h/types/property-type/iata-code/":
      input.operator_iata ?? undefined,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
      properties,
    },
  };
};
