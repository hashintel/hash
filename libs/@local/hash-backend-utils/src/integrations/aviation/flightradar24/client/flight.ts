import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import type { FlightPositionLight } from "./types.js";

const feetToMeters = (feet: number) => feet * 0.3048;

/**
 * Maps Flightradar24 flight position data to a HASH Flight entity.
 *
 * Maps position-related properties: lat, lon, altitude, direction, speeds.
 */
export const mapFlight = (
  input: FlightPositionLight,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
): { properties: Partial<HashFlight["propertiesWithMetadata"]["value"]> } => {
  const properties: Partial<HashFlight["propertiesWithMetadata"]["value"]> = {
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
  };

  return { properties };
};
