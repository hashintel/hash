import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

/**
 * A unique identifier for an entity, consisting of:
 * - A string key for in-memory deduplication
 * - Property filters for querying existing entities in the database
 */
export type EntityPrimaryKey = {
  /**
   * A string key for in-memory deduplication (e.g., "flight-BA123-2024-12-19")
   */
  key: string;
  /**
   * Property base URLs and their values for querying existing entities.
   * Used to find matching entities in the database.
   */
  properties: Record<string, string>;
};

/**
 * Generates primary keys for aviation entities.
 *
 * Returns `null` if any required field(s) missing.
 */
export const generatePrimaryKey = {
  flight: (input: {
    flightNumber: string | null | undefined;
    flightDate: string | null | undefined;
  }): EntityPrimaryKey | null => {
    if (!input.flightNumber || !input.flightDate) {
      return null;
    }

    return {
      key: `flight-${input.flightNumber}-${input.flightDate}`,
      properties: {
        [systemPropertyTypes.flightNumber.propertyTypeBaseUrl]:
          input.flightNumber,
        [systemPropertyTypes.flightDate.propertyTypeBaseUrl]: input.flightDate,
      },
    };
  },
  aircraft: (input: {
    registrationNumber: string | null | undefined;
  }): EntityPrimaryKey | null => {
    if (!input.registrationNumber) {
      return null;
    }

    return {
      key: `aircraft-${input.registrationNumber}`,
      properties: {
        [systemPropertyTypes.registrationNumber.propertyTypeBaseUrl]:
          input.registrationNumber,
      },
    };
  },
  airport: (input: {
    icaoCode: string | null | undefined;
  }): EntityPrimaryKey | null => {
    if (!input.icaoCode) {
      return null;
    }

    return {
      key: `airport-${input.icaoCode}`,
      properties: {
        [systemPropertyTypes.icaoCode.propertyTypeBaseUrl]: input.icaoCode,
      },
    };
  },
  airline: (input: {
    icaoCode: string | null | undefined;
  }): EntityPrimaryKey | null => {
    if (!input.icaoCode) {
      return null;
    }

    return {
      key: `airline-${input.icaoCode}`,
      properties: {
        [systemPropertyTypes.icaoCode.propertyTypeBaseUrl]: input.icaoCode,
      },
    };
  },
};
