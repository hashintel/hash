import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";

import {
  type BatchFlightGraphResult,
  buildFlightGraphBatch,
} from "./client/build-graph.js";
import { generateAeroApiProvenance } from "./client/provenance.js";
import type {
  AeroApiHistoricalArrivalsResponse,
  AeroApiScheduledArrivalsResponse,
  AeroApiScheduledFlight,
  HistoricalArrivalsRequestParams,
  ScheduledArrivalsRequestParams,
} from "./client/types.js";

export type { AviationProposedEntity } from "./client/build-graph.js";
export type {
  AeroApiAirport,
  AeroApiHistoricalArrivalsResponse,
  AeroApiPaginationLinks,
  AeroApiScheduledArrivalsResponse,
  AeroApiScheduledFlight,
} from "./client/types.js";

const baseUrl = "https://aeroapi.flightaware.com/aeroapi";

/**
 * Maximum pages to request from the API.
 * The rate limit is 5 result sets/second, and each page is one result set.
 */
const DEFAULT_MAX_PAGES = 5;

/**
 * Minimum interval between requests in milliseconds.
 * Throttles requests to comply with the 5 result sets/second rate limit.
 */
const REQUEST_INTERVAL_MS = 1000;

/**
 * Time to wait before retrying after a 429 rate limit error.
 */
const RATE_LIMIT_RETRY_DELAY_MS = 2000;

/** Tracks the timestamp of the last request for throttling. */
let lastRequestTime = 0;

/**
 * Sleep for a specified number of milliseconds.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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

  // Throttle requests to once per second
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_INTERVAL_MS) {
    await sleep(REQUEST_INTERVAL_MS - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-apikey": apiKey,
    },
  });

  // Handle rate limiting with retry
  if (response.status === 429) {
    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    return makeRequest<T>(url);
  }

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
  const { airportIcao, max_pages = DEFAULT_MAX_PAGES, ...queryParams } = params;
  const url = generateUrl(
    `/airports/${airportIcao}/flights/scheduled_arrivals`,
    { ...queryParams, max_pages },
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

/**
 * Retrieve a single page of historical arrivals for an airport.
 *
 * @see https://www.flightaware.com/aeroapi/portal/documentation#get-/history/airports/-id-/flights/arrivals
 */
const getHistoricalArrivals = async (
  params: HistoricalArrivalsRequestParams,
): Promise<AeroApiHistoricalArrivalsResponse> => {
  const { airportIcao, max_pages = DEFAULT_MAX_PAGES, ...queryParams } = params;
  const url = generateUrl(`/history/airports/${airportIcao}/flights/arrivals`, {
    ...queryParams,
    max_pages,
  });
  return makeRequest<AeroApiHistoricalArrivalsResponse>(url);
};

/**
 * Retrieve all historical arrivals for a single 24-hour period, handling pagination.
 */
const getAllHistoricalArrivals = async (
  params: Omit<HistoricalArrivalsRequestParams, "cursor">,
): Promise<AeroApiScheduledFlight[]> => {
  const allFlights: AeroApiScheduledFlight[] = [];

  let response = await getHistoricalArrivals(params);
  allFlights.push(...response.arrivals);

  while (response.links?.next) {
    response = await makeRequest<AeroApiHistoricalArrivalsResponse>(
      `${baseUrl}${response.links.next}`,
    );
    allFlights.push(...response.arrivals);
  }

  return allFlights;
};

/**
 * Generate 24-hour time chunks for a date range.
 * Each chunk uses 04:00 UTC to 03:59:59 UTC the next day to align with operational days.
 */
const generateDateChunks = (
  startDate: string,
  endDate: string,
): Array<{ start: string; end: string }> => {
  const chunks: Array<{ start: string; end: string }> = [];

  const startDateObj = new Date(`${startDate}T00:00:00Z`);
  const endDateObj = new Date(`${endDate}T00:00:00Z`);

  const currentDate = new Date(startDateObj);

  while (currentDate <= endDateObj) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    const nextDate = new Date(currentDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    chunks.push({
      start: `${dateStr}T04:00:00Z`,
      end: `${nextDateStr}T03:59:59Z`,
    });

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return chunks;
};

/**
 * Retrieve all historical arrivals for an airport over a date range.
 * Automatically chunks requests into 24-hour periods due to API limitations.
 *
 * @param airportIcao - ICAO airport code
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format (inclusive)
 * @returns Array of all flights across the date range
 */
const getAllHistoricalArrivalsForDateRange = async (
  airportIcao: string,
  startDate: string,
  endDate: string,
): Promise<AeroApiScheduledFlight[]> => {
  const chunks = generateDateChunks(startDate, endDate);
  const allFlights: AeroApiScheduledFlight[] = [];

  for (const chunk of chunks) {
    const flights = await getAllHistoricalArrivals({
      airportIcao,
      start: chunk.start,
      end: chunk.end,
    });
    allFlights.push(...flights);
  }

  return allFlights;
};

/**
 * Fetch historical arrivals for an airport over a date range and map them to HASH entities.
 *
 * @param airportIcao - ICAO airport code (e.g., "EGLL" for London Heathrow)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format (inclusive, must be yesterday or earlier)
 * @returns Deduplicated entities and links ready for database insertion
 */
export const getHistoricalArrivalEntities = async (
  airportIcao: string,
  startDate: string,
  endDate: string,
): Promise<
  BatchFlightGraphResult & {
    provenance: Pick<ProvidedEntityEditionProvenance, "sources">;
  }
> => {
  const flights = await getAllHistoricalArrivalsForDateRange(
    airportIcao,
    startDate,
    endDate,
  );

  const provenance = generateAeroApiProvenance();

  return {
    ...buildFlightGraphBatch(flights, provenance),
    provenance,
  };
};
