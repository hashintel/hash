import type {
  AeroApiScheduledArrivalsResponse,
  ScheduledArrivalsRequestParams,
} from "./client/types.js";

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
 * Retrieve scheduled arrivals for an airport from FlightAware AeroAPI.
 *
 * @see https://flightaware.com/aeroapi/portal/documentation#get-/airports/-id-/flights/scheduled_arrivals
 */
export const getScheduledArrivals = async (
  params: ScheduledArrivalsRequestParams,
): Promise<AeroApiScheduledArrivalsResponse> => {
  const { airportIcao, ...queryParams } = params;
  const url = generateUrl(
    `/airports/${airportIcao}/flights/scheduled_arrivals`,
    queryParams,
  );
  return makeRequest<AeroApiScheduledArrivalsResponse>(url);
};
