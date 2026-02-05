import {
  type BaseUrl,
  type EntityId,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * Generates string primary keys for aviation entities, used for in-memory deduplication.
 *
 * Returns `null` if any required field(s) are missing.
 */
export const generatePrimaryKey = {
  flight: (input: {
    flightNumber: string | null | undefined;
    flightDate: string | null | undefined;
  }): string | null => {
    if (!input.flightNumber || !input.flightDate) {
      return null;
    }

    return `flight-${input.flightNumber}-${input.flightDate}`;
  },
  aircraft: (input: {
    registrationNumber: string | null | undefined;
  }): string | null => {
    if (!input.registrationNumber) {
      return null;
    }

    return `aircraft-${input.registrationNumber}`;
  },
  airport: (input: { icaoCode: string | null | undefined }): string | null => {
    if (!input.icaoCode) {
      return null;
    }

    return `airport-${input.icaoCode}`;
  },
  airline: (input: { icaoCode: string | null | undefined }): string | null => {
    if (!input.icaoCode) {
      return null;
    }

    return `airline-${input.icaoCode}`;
  },
};

/**
 * The properties needed to generate a primary key for each entity type.
 */
export type PrimaryKeyInput = {
  [K in keyof typeof generatePrimaryKey]: {
    [P in keyof Parameters<(typeof generatePrimaryKey)[K]>[0]]-?: NonNullable<
      Parameters<(typeof generatePrimaryKey)[K]>[0][P]
    >;
  };
};

/**
 * Generates Graph API filters to find existing entities matching a proposed entity.
 */
export const generateEntityMatcher = {
  [systemEntityTypes.flight.entityTypeBaseUrl]: (input: ProposedEntity) => {
    return {
      all: [
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.flightNumber.propertyTypeBaseUrl,
              ],
            },
            {
              parameter:
                input.properties[
                  systemPropertyTypes.flightNumber.propertyTypeBaseUrl
                ],
            },
          ],
        },
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.flightDate.propertyTypeBaseUrl,
              ],
            },
            {
              parameter:
                input.properties[
                  systemPropertyTypes.flightDate.propertyTypeBaseUrl
                ],
            },
          ],
        },
      ],
    };
  },
  [systemEntityTypes.aircraft.entityTypeBaseUrl]: (input: ProposedEntity) => {
    return {
      all: [
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.registrationNumber.propertyTypeBaseUrl,
              ],
            },
            {
              parameter:
                input.properties[
                  systemPropertyTypes.registrationNumber.propertyTypeBaseUrl
                ],
            },
          ],
        },
      ],
    };
  },
  [systemEntityTypes.airport.entityTypeBaseUrl]: (input: ProposedEntity) => {
    return {
      all: [
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.icaoCode.propertyTypeBaseUrl,
              ],
            },
            {
              parameter:
                input.properties[
                  systemPropertyTypes.icaoCode.propertyTypeBaseUrl
                ],
            },
          ],
        },
      ],
    };
  },
  [systemEntityTypes.airline.entityTypeBaseUrl]: (input: ProposedEntity) => {
    return {
      all: [
        {
          equal: [
            {
              path: [
                "properties",
                systemPropertyTypes.icaoCode.propertyTypeBaseUrl,
              ],
            },
            {
              parameter:
                input.properties[
                  systemPropertyTypes.icaoCode.propertyTypeBaseUrl
                ],
            },
          ],
        },
      ],
    };
  },
} as const satisfies Record<BaseUrl, (input: ProposedEntity) => Filter>;

/**
 * Generates Graph API filters to find existing link entities.
 */
export const generateLinkMatcher = {
  [systemLinkEntityTypes.arrivesAt.linkEntityTypeBaseUrl]: (input: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  }) => {
    const leftEntityUuid = extractEntityUuidFromEntityId(input.leftEntityId);
    const rightEntityUuid = extractEntityUuidFromEntityId(input.rightEntityId);

    return {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: leftEntityUuid },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: rightEntityUuid },
          ],
        },
      ],
    };
  },
  [systemLinkEntityTypes.departsFrom.linkEntityTypeBaseUrl]: (input: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  }) => {
    const leftEntityUuid = extractEntityUuidFromEntityId(input.leftEntityId);
    const rightEntityUuid = extractEntityUuidFromEntityId(input.rightEntityId);

    return {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: leftEntityUuid },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: rightEntityUuid },
          ],
        },
      ],
    };
  },
  [systemLinkEntityTypes.operatedBy.linkEntityTypeBaseUrl]: (input: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  }) => {
    const leftEntityUuid = extractEntityUuidFromEntityId(input.leftEntityId);
    const rightEntityUuid = extractEntityUuidFromEntityId(input.rightEntityId);

    return {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: leftEntityUuid },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: rightEntityUuid },
          ],
        },
      ],
    };
  },
  [systemLinkEntityTypes.usesAircraft.linkEntityTypeBaseUrl]: (input: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  }) => {
    const leftEntityUuid = extractEntityUuidFromEntityId(input.leftEntityId);
    const rightEntityUuid = extractEntityUuidFromEntityId(input.rightEntityId);

    return {
      all: [
        {
          equal: [
            { path: ["leftEntity", "uuid"] },
            { parameter: leftEntityUuid },
          ],
        },
        {
          equal: [
            { path: ["rightEntity", "uuid"] },
            { parameter: rightEntityUuid },
          ],
        },
      ],
    };
  },
} as const satisfies Record<
  (typeof systemLinkEntityTypes)[keyof typeof systemLinkEntityTypes]["linkEntityTypeBaseUrl"],
  (input: { leftEntityId: EntityId; rightEntityId: EntityId }) => Filter
>;
