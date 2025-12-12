import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Aircraft as HashAircraft } from "@local/hash-isomorphic-utils/system-types/shared";

import type { Aircraft } from "../aviation-stack-client/flights.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

export const mapAircraft: MappingFunction<Aircraft, HashAircraft> = (
  input: Aircraft,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashAircraft["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/registration-number/": {
        value: input.registration,
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
      "https://hash.ai/@h/types/property-type/icao24-address/": {
        value: input.icao24,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
    },
    metadata: undefined,
  };

  const primaryKey = generatePrimaryKey.aircraft({
    "https://hash.ai/@h/types/property-type/iata-code/": input.iata,
    "https://hash.ai/@h/types/property-type/registration-number/":
      input.registration,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/aircraft/v/1"],
      properties,
    },
  };
};
