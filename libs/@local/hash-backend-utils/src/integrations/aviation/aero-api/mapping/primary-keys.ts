import type { FlightProperties } from "@local/hash-isomorphic-utils/system-types/flight";
import type {
  AircraftProperties,
  AirlineProperties,
  AirportProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";

export const generatePrimaryKey = {
  flight: (input: FlightProperties) => {
    const icaoCode = input["https://hash.ai/@h/types/property-type/icao-code/"];
    const flightNumber =
      input["https://hash.ai/@h/types/property-type/flight-number/"];
    const flightDate =
      input["https://hash.ai/@h/types/property-type/flight-date/"];

    return `${icaoCode}-${flightNumber}-${flightDate}`;
  },
  aircraft: (input: AircraftProperties) => {
    const icaoCode = input["https://hash.ai/@h/types/property-type/icao-code/"];
    const registrationNumber =
      input["https://hash.ai/@h/types/property-type/registration-number/"];

    return `aircraft-${icaoCode}-${registrationNumber}`;
  },
  airport: (input: AirportProperties) => {
    const icaoCode = input["https://hash.ai/@h/types/property-type/icao-code/"];
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];

    return `airport-${icaoCode ?? iataCode}`;
  },
  airline: (input: AirlineProperties) => {
    const icaoCode = input["https://hash.ai/@h/types/property-type/icao-code/"];
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];

    return `airline-${icaoCode ?? iataCode}`;
  },
};
