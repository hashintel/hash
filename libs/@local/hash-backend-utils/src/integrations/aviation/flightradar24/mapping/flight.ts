import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import type { FlightPositionLight } from "../flightradar24-client/types.js";
import type { MappingFunction } from "./base.js";
import { generatePrimaryKey } from "./primary-keys.js";

const feetToMeters = (feet: number) => feet * 0.3048;

/**
 * Maps Flightradar24 flight position data to a HASH Flight entity.
 *
 * Maps position-related properties: lat, lon, altitude, direction, speeds.
 */
export const mapFlight: MappingFunction<FlightPositionLight, HashFlight> = (
  input,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const flightDate = input.timestamp.split("T")[0];

  const properties: HashFlight["propertiesWithMetadata"] = {
    value: {
      "https://hash.ai/@h/types/property-type/flight-number/": {
        value: input.callsign || input.fr24_id,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          provenance,
        },
      },
      ...(input.callsign && {
        "https://hash.ai/@h/types/property-type/callsign/": {
          value: input.callsign,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
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
      "https://hash.ai/@h/types/property-type/latitude/": {
        value: input.lat,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/longitude/": {
        value: input.lon,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/altitude/": {
        value: feetToMeters(input.alt),
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/direction/": {
        value: input.track,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/ground-speed/": {
        value: input.gspeed,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/vertical-speed/": {
        value: input.vspeed,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-minute/v/1",
          provenance,
        },
      },
      "https://hash.ai/@h/types/property-type/is-on-ground/": {
        value: input.alt === 0,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
          provenance,
        },
      },
    },
  };

  const primaryKey = generatePrimaryKey.flight({
    "https://hash.ai/@h/types/property-type/callsign/":
      input.callsign || undefined,
    "https://hash.ai/@h/types/property-type/flight-number/":
      input.callsign || input.fr24_id,
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
