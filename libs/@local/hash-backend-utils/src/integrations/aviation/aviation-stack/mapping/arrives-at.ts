import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { ArrivesAt } from "@local/hash-isomorphic-utils/system-types/flight";

import type { FlightDepartureOrArrivalDetails } from "../aviation-stack-client/flights.js";
import type { MappingFunction } from "./base.js";

export const mapArrivesAt: MappingFunction<
  FlightDepartureOrArrivalDetails,
  ArrivesAt,
  true
> = (
  input: FlightDepartureOrArrivalDetails,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: ArrivesAt["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/scheduled-time/": {
        value: input.scheduled,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
          provenance,
        },
      },
      ...(input.terminal !== null && {
        "https://hash.ai/@h/types/property-type/terminal/": {
          value: input.terminal,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.gate !== null && {
        "https://hash.ai/@h/types/property-type/gate/": {
          value: input.gate,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.baggage !== null && {
        "https://hash.ai/@h/types/property-type/baggage-claim/": {
          value: input.baggage,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.delay !== null && {
        "https://hash.ai/@h/types/property-type/delay-in-minutes/": {
          value: input.delay,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
            provenance,
          },
        },
      }),
      ...(input.estimated !== null && {
        "https://hash.ai/@h/types/property-type/estimated-time/": {
          value: input.estimated,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual !== null && {
        "https://hash.ai/@h/types/property-type/actual-time/": {
          value: input.actual,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
    },
  };

  return {
    primaryKey: null,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/arrives-at/v/1"],
      properties,
    },
  };
};
