import type { FlightProperties } from "@local/hash-isomorphic-utils/system-types/flight";

export const generatePrimaryKey = {
  flight: (input: FlightProperties) => {
    const callsign = input["https://hash.ai/@h/types/property-type/callsign/"];
    const flightNumber =
      input["https://hash.ai/@h/types/property-type/flight-number/"];
    const flightDate =
      input["https://hash.ai/@h/types/property-type/flight-date/"];

    return `flight-${callsign ?? flightNumber}-${flightDate}`;
  },
};
