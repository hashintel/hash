import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Airline as HashAirline } from "@local/hash-isomorphic-utils/system-types/shared";

import { generatePrimaryKey } from "../../../shared/primary-keys.js";
import type { AeroApiScheduledFlight } from "../types.js";
import type { MappingFunction } from "./mapping-types.js";

export type AeroApiAirlineInput = Pick<
  AeroApiScheduledFlight,
  "operator" | "operator_icao" | "operator_iata"
>;

/**
 * Maps AeroAPI operator data to a HASH Airline entity.
 */
export const mapAirline: MappingFunction<AeroApiAirlineInput, HashAirline> = (
  input: AeroApiAirlineInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const primaryKey = generatePrimaryKey.airline({
    icaoCode: input.operator_icao,
  });

  if (!primaryKey) {
    return null;
  }

  const properties: HashAirline["propertiesWithMetadata"] = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value:
          input.operator ?? input.operator_icao ?? input.operator_iata ?? "",
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/icao-code/": {
        value: input.operator_icao!,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
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

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
      properties,
    },
  };
};
