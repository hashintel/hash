import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Airline as HashAirline } from "@local/hash-isomorphic-utils/system-types/shared";

import type { Airline } from "../aviation-stack-client/flights.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

export const mapAirline: MappingFunction<Airline, HashAirline> = (
  input: Airline,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashAirline["propertiesWithMetadata"] = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: input.name,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/iata-code/": {
        value: input.iata,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/icao-code/": {
        value: input.icao,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
    },
    metadata: undefined,
  };

  const primaryKey = generatePrimaryKey.airline({
    "https://hash.ai/@h/types/property-type/iata-code/": input.iata,
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      input.name,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"],
      properties,
    },
  };
};
