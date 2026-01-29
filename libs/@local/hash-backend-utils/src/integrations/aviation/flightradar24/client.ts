import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import type { Flight as HashFlight } from "@local/hash-isomorphic-utils/system-types/flight";

import { mapFlight } from "./client/flight.js";
import { generateFlightradar24Provenance } from "./client/provenance.js";
import type {
  ErrorResponse,
  FlightPositionsLightRequestParams,
  FlightPositionsLightResponse,
} from "./client/types.js";

const baseUrl = "https://fr24api.flightradar24.com/api/";

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

const makeRequest = async <T extends object>(url: string): Promise<T> => {
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

    throw new Error(`Flightradar24 API error: ${stringifyError(errorData)}`);
  }

  const data = (await response.json()) as T | ErrorResponse;

  if ("error" in data) {
    throw new Error(
      `Flightradar24 API error: ${data.error.message} (code: ${data.error.code})`,
    );
  }

  return data;
};

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
