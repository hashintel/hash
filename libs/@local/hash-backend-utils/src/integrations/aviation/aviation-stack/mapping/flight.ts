import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type {
  Flight as HashFlight,
  FlightStatusDataType,
} from "@local/hash-isomorphic-utils/system-types/flight";

import type { Flight } from "../aviation-stack-client/flights.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

const statusMap: Record<Flight["flight_status"], FlightStatusDataType> = {
  scheduled: "Scheduled",
  active: "Active",
  landed: "Landed",
  cancelled: "Cancelled",
  incident: "Incident",
  diverted: "Diverted",
};

export const mapFlight: MappingFunction<Flight, HashFlight> = (
  input: Flight,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashFlight["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/flight-number/": {
        value: input.flight.number,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/flight-date/": {
        value: input.flight_date,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/iata-code/": {
        value: input.flight.iata,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/icao-code/": {
        value: input.flight.icao,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/flight-status/": {
        value: statusMap[input.flight_status],
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/flight-status/v/1",
          provenance,
        },
      },
      ...(input.live && {
        "https://hash.ai/@h/types/property-type/latitude/": {
          value: input.live.latitude,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/longitude/": {
          value: input.live.longitude,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/altitude/": {
          value: input.live.altitude,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/direction/": {
          value: input.live.direction,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/horizontal-speed/": {
          value: input.live.speed_horizontal,
          metadata: {
            dataTypeId:
              "https://hash.ai/@h/types/data-type/kilometers-per-hour/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/vertical-speed/": {
          value: input.live.speed_vertical,
          metadata: {
            dataTypeId:
              "https://hash.ai/@h/types/data-type/kilometers-per-hour/v/1",
            provenance,
          },
        },
        "https://hash.ai/@h/types/property-type/is-on-ground/": {
          value: input.live.is_ground,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
            provenance,
          },
        },
      }),
    },
  };

  const primaryKey = generatePrimaryKey.flight({
    "https://hash.ai/@h/types/property-type/iata-code/": input.flight.iata,
    "https://hash.ai/@h/types/property-type/flight-number/":
      input.flight.number,
    "https://hash.ai/@h/types/property-type/flight-date/": input.flight_date,
  });

  return {
    primaryKey,
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"],
      properties,
    },
  };
};
