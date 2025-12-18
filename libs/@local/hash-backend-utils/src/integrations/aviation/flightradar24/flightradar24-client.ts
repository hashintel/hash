import type {
  ErrorResponse,
  FlightPositionsLightRequestParams,
  FlightPositionsLightResponse,
} from "./flightradar24-client/types.js";

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

const makeRequest = async <T>(url: string): Promise<T> => {
  const apiToken = process.env.FLIGHTRADAR24_API_TOKEN;

  if (!apiToken) {
    throw new Error("FLIGHTRADAR24_API_TOKEN environment variable is not set");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    const errorData = (await response.json()) as ErrorResponse;
    throw new Error(
      `Flightradar24 API error: ${errorData.error.message} (code: ${errorData.error.code})`,
    );
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
