import type { PaginationResponse } from "./types.js";

type FlightStatus =
  | "scheduled"
  | "active"
  | "landed"
  | "cancelled"
  | "incident"
  | "diverted";

export type FlightsRequestParams = {
  /** Limit the API response to a specific flight status by passing one of the following values: scheduled, active, landed, cancelled, incident, diverted */
  flight_status?: FlightStatus;
  /** Filter results by flight number (e.g., "2557") */
  flight_number?: string;
  /** Filter by departure IATA code (e.g., "JFK") */
  dep_iata?: string;
  /** Filter by departure ICAO code (e.g., "KJFK") */
  dep_icao?: string;
  /** Filter by arrival IATA code (e.g., "LAX") */
  arr_iata?: string;
  /** Filter by arrival ICAO code (e.g., "KLAX") */
  arr_icao?: string;
  /** Filter by airline IATA code (e.g., "AA") */
  airline_iata?: string;
  /** Filter by airline ICAO code (e.g., "AAL") */
  airline_icao?: string;
  /** Filter by airline name */
  airline_name?: string;
  /** Filter by flight IATA code (e.g., "AA2557") */
  flight_iata?: string;
  /** Filter by flight ICAO code (e.g., "AAL2557") */
  flight_icao?: string;
  /** Limit the number of results (max depends on subscription) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Filter by flight date (format: YYYY-MM-DD) – up to 3 months in the past */
  flight_date?: string;
  /** Minimum delay in departure in minutes */
  min_delay_dep?: number;
  /** Maximum delay in departure in minutes */
  max_delay_dep?: number;
  /** Minimum delay in arrival in minutes */
  min_delay_arr?: number;
  /** Maximum delay in arrival in minutes */
  max_delay_arr?: number;
};

export type FlightDepartureOrArrivalDetails = {
  /** The name of the airport (e.g., "San Francisco International") */
  airport: string;
  /** The timezone of the airport (e.g., "America/Los_Angeles") */
  timezone: string;
  /** The IATA code of the airport (e.g., "SFO") */
  iata: string;
  /** The ICAO code of the airport (e.g., "KSFO") */
  icao: string;
  /** The terminal at the airport, if available */
  terminal: string | null;
  /** The gate at the airport, if available */
  gate: string | null;
  /** The baggage claim area, if available (arrival only) */
  baggage: string | null;
  /** The delay in minutes, if the flight is delayed */
  delay: number | null;
  /** The scheduled departure/arrival time (ISO 8601 format) */
  scheduled: string;
  /** The estimated departure/arrival time (ISO 8601 format), if available */
  estimated: string | null;
  /** The actual departure/arrival time (ISO 8601 format), if available */
  actual: string | null;
  /** The estimated time the aircraft will be on the runway (ISO 8601 format), if available */
  estimated_runway: string | null;
  /** The actual time the aircraft was on the runway (ISO 8601 format), if available */
  actual_runway: string | null;
};

export type Airline = {
  /** The full name of the airline (e.g., "American Airlines") */
  name: string;
  /** The IATA code of the airline (e.g., "AA") */
  iata: string;
  /** The ICAO code of the airline (e.g., "AAL") */
  icao: string;
};

export type FlightInfo = {
  /** The flight number (e.g., "2557") */
  number: string;
  /** The IATA flight code (e.g., "AA2557") */
  iata: string;
  /** The ICAO flight code (e.g., "AAL2557") */
  icao: string;
  /** Details of the operating flight if this is a codeshare (unknown object) */
  codeshared: unknown;
};

export type Aircraft = {
  /** The aircraft registration number (tail number, e.g., "N123AB") */
  registration: string;
  /** The IATA aircraft type code (e.g., "738" for Boeing 737-800) */
  iata: string;
  /** The ICAO aircraft type code (e.g., "B738" for Boeing 737-800) */
  icao: string;
  /** The ICAO 24-bit transponder address in hexadecimal */
  icao24: string;
};

export type LiveTracking = {
  /** The timestamp when the live data was last updated (ISO 8601 format) */
  updated: string;
  /** The current latitude of the aircraft in decimal degrees */
  latitude: number;
  /** The current longitude of the aircraft in decimal degrees */
  longitude: number;
  /** The current altitude of the aircraft in meters */
  altitude: number;
  /** The current direction/heading of the aircraft in degrees (0-360) */
  direction: number;
  /** The horizontal speed of the aircraft in km/h */
  speed_horizontal: number;
  /** The vertical speed of the aircraft in km/h */
  speed_vertical: number;
  /** Whether the aircraft is currently on the ground */
  is_ground: boolean;
};

export type Flight = {
  /** The date of the flight (format: YYYY-MM-DD) */
  flight_date: string;
  /** The current status of the flight */
  flight_status: FlightStatus;
  /** Details about the departure airport and times */
  departure: FlightDepartureOrArrivalDetails;
  /** Details about the arrival airport and times */
  arrival: FlightDepartureOrArrivalDetails;
  /** Information about the airline operating the flight */
  airline: Airline;
  /** Flight number and code information */
  flight: FlightInfo;
  /** Aircraft details, if available */
  aircraft: Aircraft | null;
  /** Real-time tracking data, if available */
  live: LiveTracking | null;
};

export type FlightsResponse = {
  /** Pagination information for the response */
  pagination: PaginationResponse;
  /** Array of flight records matching the request parameters */
  data: Flight[];
};
