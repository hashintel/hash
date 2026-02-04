import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import { createRateLimitedRequester } from "../../../rate-limiter.js";
import { mapFlight } from "./client/flight.js";
import { generateFlightradar24Provenance } from "./client/provenance.js";
import type {
  ErrorResponse,
  FlightPositionsLightRequestParams,
  FlightPositionsLightResponse,
} from "./client/types.js";

const baseUrl = "https://fr24api.flightradar24.com/api/";

/**
 * Minimum interval between requests in milliseconds.
 * Flightradar24 API rate limit is 10 queries per minute = 6 seconds per query.
 */
const REQUEST_INTERVAL_MS = 6000;

/**
 * Maximum number of retry attempts for rate limit errors.
 */
const MAX_RETRIES = 10;

const generateUrl = (path: string, params?: Record<string, unknown>) => {
  const url = new URL(`${baseUrl}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(","));
      } else if (typeof value === "string" || typeof value === "number") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
};

/**
 * Raw fetch function for Flightradar24 API requests.
 * Throws an error with status property for rate limit handling.
 */
async function fetchFlightradar24<T>(url: string): Promise<T> {
  const apiToken = process.env.FLIGHTRADAR24_API_TOKEN;

  if (!apiToken) {
    throw new Error("FLIGHTRADAR24_API_TOKEN environment variable is not set");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Version": "v1",
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as unknown;
    const error = new Error(
      `Flightradar24 API error: ${stringifyError(errorData)}`,
    );
    (error as Error & { status: number }).status = response.status;
    throw error;
  }

  const data = (await response.json()) as unknown;

  // Check for error response structure
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as ErrorResponse).error === "object"
  ) {
    const errorResponse = data as ErrorResponse;
    throw new Error(
      `Flightradar24 API error: ${errorResponse.error.message} (code: ${errorResponse.error.code})`,
    );
  }

  return data as T;
}

/**
 * Rate-limited request function for Flightradar24 API.
 * Uses promise chaining to ensure proper request spacing and handles 429 errors with backoff.
 */
const makeRequest = createRateLimitedRequester(fetchFlightradar24, {
  requestIntervalMs: REQUEST_INTERVAL_MS,
  maxRetries: MAX_RETRIES,
});

/**
 * Retrieve live flight position data from Flightradar24's flight-positions/light endpoint.
 *
 * @see https://fr24api.flightradar24.com/docs/endpoints/overview#live-flight-positions-light
 */
export const getFlightPositionsLight = async (
  params: FlightPositionsLightRequestParams,
): Promise<FlightPositionsLightResponse> => {
  const url = generateUrl("live/flight-positions/light", params);
  return makeRequest<FlightPositionsLightResponse>(url);
};

/**
 * Fetch live flight position by callsign and map to a HASH Flight entity.
 *
 * @param flightNumber - Flight number (e.g., "BAW123")
 * @returns The flight entity if found, or null if no matching flight or missing data
 */
export const getFlightPositionProperties = async (
  flightNumber: string,
): Promise<{
  provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
  properties: Partial<HashFlight["propertiesWithMetadata"]["value"]>;
} | null> => {
  const response = await getFlightPositionsLight({ flights: flightNumber });

  const flight = response.data[0];
  if (!flight) {
    return null;
  }

  const provenance = generateFlightradar24Provenance();

  return {
    ...mapFlight(flight, provenance),
    provenance,
  };
};
