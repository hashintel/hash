import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";

import {
  type BatchFlightGraphResult,
  buildFlightGraphBatch,
} from "./client/build-graph.js";
import { generateAeroApiProvenance } from "./client/provenance.js";
import type {
  AeroApiScheduledArrivalsResponse,
  AeroApiScheduledFlight,
  ScheduledArrivalsRequestParams,
} from "./client/types.js";

export type { AviationProposedEntity } from "./client/build-graph.js";
export type {
  AeroApiAirport,
  AeroApiPaginationLinks,
  AeroApiScheduledArrivalsResponse,
  AeroApiScheduledFlight,
} from "./client/types.js";

const baseUrl = "https://aeroapi.flightaware.com/aeroapi";

const generateUrl = (
  path: string,
  params?: Record<string, string | number | undefined>,
) => {
  const url = new URL(`${baseUrl}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
};

const makeRequest = async <T>(url: string): Promise<T> => {
  const apiKey = process.env.AERO_API_KEY;

  if (!apiKey) {
    throw new Error("AERO_API_KEY environment variable is not set");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-apikey": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AeroAPI error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  return (await response.json()) as T;
};

/**
 * Retrieve a single page of scheduled arrivals for an airport.
 *
 * @see https://www.flightaware.com/aeroapi/portal/documentation#get-/airports/-id-/flights/scheduled_arrivals
 */
const getScheduledArrivals = async (
  params: ScheduledArrivalsRequestParams,
): Promise<AeroApiScheduledArrivalsResponse> => {
  const { airportIcao, ...queryParams } = params;
  const url = generateUrl(
    `/airports/${airportIcao}/flights/scheduled_arrivals`,
    queryParams,
  );
  return makeRequest<AeroApiScheduledArrivalsResponse>(url);
};

/**
 * Retrieve all scheduled arrivals for an airport, handling pagination automatically.
 */
const getAllScheduledArrivals = async (
  params: Omit<ScheduledArrivalsRequestParams, "cursor">,
): Promise<AeroApiScheduledFlight[]> => {
  const allFlights: AeroApiScheduledFlight[] = [];

  let response = await getScheduledArrivals(params);
  allFlights.push(...response.scheduled_arrivals);

  while (response.links?.next) {
    response = await makeRequest<AeroApiScheduledArrivalsResponse>(
      `${baseUrl}${response.links.next}`,
    );
    allFlights.push(...response.scheduled_arrivals);
  }

  return allFlights;
};

/**
 * Fetch scheduled arrivals for an airport on a given date and map them to HASH entities.
 *
 * @param airportIcao - ICAO airport code (e.g., "EGLL" for London Heathrow)
 * @param date - Date string in YYYY-MM-DD format
 * @returns Deduplicated entities and links ready for database insertion
 */
export const getScheduledArrivalEntities = async (
  airportIcao: string,
  date: string,
): Promise<
  BatchFlightGraphResult & {
    provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
  }
> => {
  const start = `${date}T04:00:00Z`;

  const dateObj = new Date(date);
  dateObj.setUTCDate(dateObj.getUTCDate() + 1);
  const tomorrow = dateObj.toISOString().slice(0, 10);
  const end = `${tomorrow}T03:59:59Z`;

  const flights = await getAllScheduledArrivals({
    airportIcao,
    start,
    end,
  });

  const provenance = generateAeroApiProvenance();

  return {
    ...buildFlightGraphBatch(flights, provenance),
    provenance,
  };
};
