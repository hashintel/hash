import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Airport as HashAirport } from "@local/hash-isomorphic-utils/system-types/shared";

import type { FlightDepartureOrArrivalDetails } from "../aviation-stack-client/flights.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

export const mapAirport: MappingFunction<
  FlightDepartureOrArrivalDetails,
  HashAirport
> = (
  input: FlightDepartureOrArrivalDetails,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashAirport["propertiesWithMetadata"] = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: input.airport,
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
      "https://hash.ai/@h/types/property-type/timezone/": {
        value: input.timezone,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
    },
    metadata: undefined,
  };

  const primaryKey = generatePrimaryKey.airport({
    "https://hash.ai/@h/types/property-type/iata-code/": input.iata,
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
      input.airport,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"],
      properties,
    },
  };
};
