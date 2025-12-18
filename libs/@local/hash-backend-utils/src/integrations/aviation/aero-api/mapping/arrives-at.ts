import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import type { ArrivesAt as HashArrivesAt } from "@local/hash-isomorphic-utils/system-types/flight";

import type { AeroApiScheduledFlight } from "../client/types.js";
import type { MappingFunction } from "./base.js";

/**
 * Input type for arrival link mapping from AeroAPI data.
 */
export type AeroApiArrivalInput = Pick<
  AeroApiScheduledFlight,
  | "gate_destination"
  | "terminal_destination"
  | "actual_runway_on"
  | "baggage_claim"
  | "arrival_delay"
  | "scheduled_in"
  | "estimated_in"
  | "actual_in"
  | "scheduled_on"
  | "estimated_on"
  | "actual_on"
>;

/**
 * Maps AeroAPI arrival data to a HASH "Arrives At" link entity.
 */
export const mapArrivesAt: MappingFunction<
  AeroApiArrivalInput,
  HashArrivesAt,
  true
> = (
  input: AeroApiArrivalInput,
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">,
) => {
  const properties: HashArrivesAt["propertiesWithMetadata"] = {
    value: {
      ...(input.gate_destination && {
        "https://hash.ai/@h/types/property-type/gate/": {
          value: input.gate_destination,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.terminal_destination && {
        "https://hash.ai/@h/types/property-type/terminal/": {
          value: input.terminal_destination,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_runway_on && {
        "https://hash.ai/@h/types/property-type/runway/": {
          value: input.actual_runway_on,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.baggage_claim && {
        "https://hash.ai/@h/types/property-type/baggage-claim/": {
          value: input.baggage_claim,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            provenance,
          },
        },
      }),
      ...(input.arrival_delay !== null && {
        "https://hash.ai/@h/types/property-type/delay-in-seconds/": {
          value: input.arrival_delay,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1",
            provenance,
          },
        },
      }),
      // Gate times
      ...(input.scheduled_in && {
        "https://hash.ai/@h/types/property-type/scheduled-gate-time/": {
          value: input.scheduled_in,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.estimated_in && {
        "https://hash.ai/@h/types/property-type/estimated-gate-time/": {
          value: input.estimated_in,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_in && {
        "https://hash.ai/@h/types/property-type/actual-gate-time/": {
          value: input.actual_in,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      // Runway times
      ...(input.scheduled_on && {
        "https://hash.ai/@h/types/property-type/scheduled-runway-time/": {
          value: input.scheduled_on,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.estimated_on && {
        "https://hash.ai/@h/types/property-type/estimated-runway-time/": {
          value: input.estimated_on,
          metadata: {
            dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
            provenance,
          },
        },
      }),
      ...(input.actual_on && {
        "https://hash.ai/@h/types/property-type/actual-runway-time/": {
          value: input.actual_on,
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
      entityTypeIds: ["https://hash.ai/@h/types/entity-type/arrives-at/v/1"],
      properties,
    },
  };
};
