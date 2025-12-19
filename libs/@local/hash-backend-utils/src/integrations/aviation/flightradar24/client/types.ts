export type ErrorResponse = {
  /** Error details from the Flightradar24 API */
  error: {
    /** A unique error code identifying the type of error */
    code: string;
    /** A human-readable description of the error */
    message: string;
  };
};

/**
 * Flight categories used by Flightradar24
 * - P: Passenger
 * - C: Cargo
 * - M: Military
 * - J: Business Jet
 * - T: General Aviation (Turboprop)
 * - H: Helicopter
 * - B: Balloon
 * - G: Glider
 * - D: Drone
 * - V: Ground Vehicle
 * - O: Other
 * - N: Non-categorized
 */
export type FlightCategory =
  | "P"
  | "C"
  | "M"
  | "J"
  | "T"
  | "H"
  | "B"
  | "G"
  | "D"
  | "V"
  | "O"
  | "N";

/**
 * Request parameters for the flight-positions/light endpoint.
 *
 * At least one of the filter parameters is required.
 */
export type FlightPositionsLightRequestParams = {
  /** Geographic bounds: north,south,west,east (comma-separated float values) */
  bounds?: string;
  /** Comma-separated list of flight numbers (max 15) */
  flights?: string;
  /** Comma-separated list of flight callsigns (max 15) */
  callsigns?: string;
  /** Comma-separated list of aircraft registration numbers (max 15) */
  registrations?: string;
  /**
   * Airports using IATA, ICAO, or ISO 3166-1 alpha-2 codes.
   * Optional direction prefix: "inbound:JFK,outbound:LAX"
   */
  airports?: string;
  /** Flight routes between airports or countries (e.g., "JFK-LAX,LHR-CDG") */
  routes?: string;
  /** Comma-separated list of aircraft ICAO type codes (max 15) */
  aircraft?: string;
  /** Altitude ranges in feet (e.g., "0-3000,30000-40000") */
  altitude_ranges?: string;
  /** Comma-separated list of flight categories */
  categories?: FlightCategory[];
  /** Maximum number of results to return (max 30000) */
  limit?: number;
};

/**
 * A flight position record from the light endpoint.
 */
export type FlightPositionLight = {
  /** Unique identifier assigned by Flightradar24 to each flight */
  fr24_id: string;
  /**
   * The ICAO 24-bit transponder address in hexadecimal
   */
  hex: string;
  /**
   * Up to 8 characters as sent from the aircraft's transponder
   */
  callsign: string;
  /** Latitude of the aircraft's position in decimal degrees */
  lat: number;
  /** Longitude of the aircraft's position in decimal degrees */
  lon: number;
  /** Track angle of the aircraft in degrees (0-360) */
  track: number;
  /** Altitude of the aircraft in feet */
  alt: number;
  /** Ground speed of the aircraft in knots */
  gspeed: number;
  /** Vertical speed of the aircraft in feet per minute */
  vspeed: number;
  /** 4-digit squawk code of the aircraft */
  squawk: number;
  /** Timestamp of the position data (ISO 8601 format) */
  timestamp: string;
  /** Source of the position data, e.g. "ADSB" */
  source: string;
};

export type FlightPositionsLightResponse = {
  /** Array of flight position records matching the request parameters */
  data: FlightPositionLight[];
};
