/**
 * Request parameters for the scheduled arrivals endpoint.
 */
export type ScheduledArrivalsRequestParams = {
  /** ICAO airport code */
  airportIcao: string;
  /** Filter by airline (ICAO code) */
  airline?: string;
  /** Filter by flight type (e.g., "Airline", "General_Aviation") */
  type?: string;
  /** Start of time range (ISO 8601) */
  start?: string;
  /** End of time range (ISO 8601) */
  end?: string;
  /** Maximum number of pages to fetch (default: 1) */
  max_pages?: number;
  /** Cursor for pagination */
  cursor?: string;
};

/**
 * Airport information in AeroAPI responses.
 */
export type AeroApiAirport = {
  /** Primary airport code (ICAO if available, otherwise IATA or LID) */
  code: string;
  /** ICAO airport code */
  code_icao: string | null;
  /** IATA airport code */
  code_iata: string | null;
  /** FAA Location Identifier */
  code_lid: string | null;
  /** Timezone identifier (e.g., "Europe/Berlin") */
  timezone: string;
  /** Airport name */
  name: string;
  /** City where the airport is located */
  city: string;
  /** Relative URL for airport info */
  airport_info_url: string;
};

/**
 * Scheduled flight information from AeroAPI.
 */
export type AeroApiScheduledFlight = {
  /** Flight identifier (usually callsign) */
  ident: string;
  /** ICAO flight identifier */
  ident_icao: string | null;
  /** IATA flight identifier */
  ident_iata: string | null;
  /** Actual runway used for takeoff */
  actual_runway_off: string | null;
  /** Actual runway used for landing */
  actual_runway_on: string | null;
  /** FlightAware unique flight identifier */
  fa_flight_id: string;
  /** Operating airline code */
  operator: string | null;
  /** Operating airline ICAO code */
  operator_icao: string | null;
  /** Operating airline IATA code */
  operator_iata: string | null;
  /** Flight number (numeric portion only) */
  flight_number: string | null;
  /** Aircraft registration number */
  registration: string | null;
  /** ATC identifier/callsign */
  atc_ident: string | null;
  /** FlightAware ID of the inbound flight */
  inbound_fa_flight_id: string | null;
  /** Codeshare flight numbers (ICAO format) */
  codeshares: string[];
  /** Codeshare flight numbers (IATA format) */
  codeshares_iata: string[];
  /** Whether flight information is blocked */
  blocked: boolean;
  /** Whether the flight has been diverted */
  diverted: boolean;
  /** Whether the flight has been cancelled */
  cancelled: boolean;
  /** Whether this is position-only data (no flight plan) */
  position_only: boolean;
  /** Origin airport information */
  origin: AeroApiAirport | null;
  /** Destination airport information */
  destination: AeroApiAirport | null;
  /** Departure delay in seconds */
  departure_delay: number | null;
  /** Arrival delay in seconds */
  arrival_delay: number | null;
  /** Filed estimated time enroute in seconds */
  filed_ete: number | null;
  /** Scheduled gate departure time (ISO 8601) */
  scheduled_out: string | null;
  /** Estimated gate departure time (ISO 8601) */
  estimated_out: string | null;
  /** Actual gate departure time (ISO 8601) */
  actual_out: string | null;
  /** Scheduled runway departure time (ISO 8601) */
  scheduled_off: string | null;
  /** Estimated runway departure time (ISO 8601) */
  estimated_off: string | null;
  /** Actual runway departure time (ISO 8601) */
  actual_off: string | null;
  /** Scheduled runway arrival time (ISO 8601) */
  scheduled_on: string | null;
  /** Estimated runway arrival time (ISO 8601) */
  estimated_on: string | null;
  /** Actual runway arrival time (ISO 8601) */
  actual_on: string | null;
  /** Scheduled gate arrival time (ISO 8601) */
  scheduled_in: string | null;
  /** Estimated gate arrival time (ISO 8601) */
  estimated_in: string | null;
  /** Actual gate arrival time (ISO 8601) */
  actual_in: string | null;
  /** Flight progress percentage (0-100) */
  progress_percent: number | null;
  /** Human-readable flight status */
  status: string | null;
  /** ICAO aircraft type code */
  aircraft_type: string | null;
  /** Route distance in statute miles */
  route_distance: number | null;
  /** Filed airspeed in knots */
  filed_airspeed: number | null;
  /** Filed altitude in feet (hundreds) */
  filed_altitude: number | null;
  /** Filed route string */
  route: string | null;
  /** Baggage claim area */
  baggage_claim: string | null;
  /** Number of business class seats */
  seats_cabin_business: number | null;
  /** Number of coach/economy seats */
  seats_cabin_coach: number | null;
  /** Number of first class seats */
  seats_cabin_first: number | null;
  /** Departure gate */
  gate_origin: string | null;
  /** Arrival gate */
  gate_destination: string | null;
  /** Departure terminal */
  terminal_origin: string | null;
  /** Arrival terminal */
  terminal_destination: string | null;
  /** Flight type (e.g., "Airline", "General_Aviation") */
  type: string;
};

/**
 * Pagination links in AeroAPI responses.
 */
export type AeroApiPaginationLinks = {
  /** URL for the next page of results */
  next: string | null;
};

/**
 * Response from the scheduled arrivals endpoint.
 */
export type AeroApiScheduledArrivalsResponse = {
  /** Pagination links */
  links: AeroApiPaginationLinks | null;
  /** Number of pages available */
  num_pages: number;
  /** Array of scheduled flights */
  scheduled_arrivals: AeroApiScheduledFlight[];
};

/**
 * Request parameters for the historical arrivals endpoint.
 * Note: The historical endpoint has a maximum time range of 24 hours.
 */
export type HistoricalArrivalsRequestParams = {
  /** ICAO airport code */
  airportIcao: string;
  /** Filter by airline (ICAO code) */
  airline?: string;
  /** Filter by flight type (e.g., "Airline", "General_Aviation") */
  type?: string;
  /** Start of time range (ISO 8601) - required for historical queries */
  start: string;
  /** End of time range (ISO 8601) - required, max 24 hours from start */
  end: string;
  /** Maximum number of pages to fetch (default: 1) */
  max_pages?: number;
  /** Cursor for pagination */
  cursor?: string;
};

/**
 * Response from the historical arrivals endpoint.
 * Same structure as scheduled arrivals but with `arrivals` array.
 */
export type AeroApiHistoricalArrivalsResponse = {
  /** Pagination links */
  links: AeroApiPaginationLinks | null;
  /** Number of pages available */
  num_pages: number;
  /** Array of historical flights */
  arrivals: AeroApiScheduledFlight[];
};
