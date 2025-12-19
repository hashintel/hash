/**
 * Generates primary keys for aviation entities.
 *
 * Returns `null` if any required field(s) missing.
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
  airport: (input: {
    icaoCode: string | null | undefined;
  }): string | null => {
    if (!input.icaoCode) {
      return null;
    }

    return `airport-${input.icaoCode}`;
  },
  airline: (input: {
    icaoCode: string | null | undefined;
  }): string | null => {
    if (!input.icaoCode) {
      return null;
    }

    return `airline-${input.icaoCode}`;
  },
};
