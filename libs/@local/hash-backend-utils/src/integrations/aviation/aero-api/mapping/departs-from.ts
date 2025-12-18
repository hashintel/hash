import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { DepartsFrom as HashDepartsFrom } from "@local/hash-isomorphic-utils/system-types/flight";

import type { AeroApiScheduledFlight } from "../client/types.js";
import type { MappingFunction } from "./base.js";

/**
 * Input type for departure link mapping from AeroAPI data.
 */
export type AeroApiDepartureInput = Pick<
  AeroApiScheduledFlight,
  | "gate_origin"
  | "terminal_origin"
  | "actual_runway_off"
  | "departure_delay"
  | "scheduled_out"
  | "estimated_out"
  | "actual_out"
  | "scheduled_off"
  | "estimated_off"
  | "actual_off"
>;

/**
 * Maps AeroAPI departure data to a HASH "Departs From" link entity.
 */
export const mapDepartsFrom: MappingFunction<
  AeroApiDepartureInput,
  HashDepartsFrom,
  true
> = (
  input: AeroApiDepartureInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashDepartsFrom["propertiesWithMetadata"] = {
    value: {
      ...(input.gate_origin && {
        "https://hash.ai/@h/types/property-type/gate/": {
          value: input.gate_origin,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.terminal_origin && {
        "https://hash.ai/@h/types/property-type/terminal/": {
          value: input.terminal_origin,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_runway_off && {
        "https://hash.ai/@h/types/property-type/runway/": {
          value: input.actual_runway_off,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.departure_delay !== null && {
        "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
          value: input.departure_delay,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
            provenance,
          },
        },
      }),
      // Gate times
      ...(input.scheduled_out && {
        "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
          value: input.scheduled_out,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.estimated_out && {
        "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
          value: input.estimated_out,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_out && {
        "https://hash.ai/@h/types/property-type/actual-gate-time/": {
          value: input.actual_out,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      // Runway times
      ...(input.scheduled_off && {
        "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
          value: input.scheduled_off,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.estimated_off && {
        "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
          value: input.estimated_off,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_off && {
        "https://hash.ai/@h/types/property-type/actual-runway-time/": {
          value: input.actual_off,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
    },
  };

  return {
    primaryKey: null, // Links don't have primary keys
    typeIdsAndProperties: {
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/departs-from/v/1"],
      properties,
    },
  };
};
