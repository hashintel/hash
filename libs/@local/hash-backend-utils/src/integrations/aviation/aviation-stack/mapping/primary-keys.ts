import type { FlightProperties } from "@local/hash-isomorphic-utils/system-types/flight";
import type {
  AircraftProperties,
  AirlineProperties,
  AirportProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";

export const generatePrimaryKey = {
  flight: (input: FlightProperties) => {
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];
    const flightNumber =
      input["https://hash.ai/@h/types/property-type/flight-number/"];
    const flightDate =
      input["https://hash.ai/@h/types/property-type/flight-date/"];

    return `${iataCode}-${flightNumber}-${flightDate}`;
  },
  airport: (input: AirportProperties) => {
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];
    const name =
      input[
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
      ];

    return `airport-${iataCode}-${name}`;
  },
  airline: (input: AirlineProperties) => {
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];
    const name =
      input[
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
      ];
    return `airline-${iataCode}-${name}`;
  },
  aircraft: (input: AircraftProperties) => {
    const iataCode = input["https://hash.ai/@h/types/property-type/iata-code/"];
    const registrationNumber =
      input["https://hash.ai/@h/types/property-type/registration-number/"];

    return `aircraft-${iataCode}-${registrationNumber}`;
  },
};
