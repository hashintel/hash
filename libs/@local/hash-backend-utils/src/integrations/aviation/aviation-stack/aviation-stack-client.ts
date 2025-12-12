import type {
  FlightsRequestParams,
  FlightsResponse,
} from "./aviation-stack-client/flights.js";
import type { ErrorResponse } from "./aviation-stack-client/types.js";

const baseUrl = "https://api.aviationstack.com/v1/";

const generateUrl = (path: string, params?: Record<string, unknown>) => {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("access_key", process.env.AVIATION_STACK_API_KEY ?? "");

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (
        value !== undefined &&
        (typeof value === "string" || typeof value === "number")
      ) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
};

export const getFlights = async (
  params?: FlightsRequestParams,
): Promise<FlightsResponse> => {
  const url = generateUrl("flights", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = (await response.json()) as ErrorResponse;
    throw new Error(
      `Aviation Stack API error: ${errorData.error.message} (code: ${errorData.error.code})`,
    );
  }

  const data = (await response.json()) as FlightsResponse | ErrorResponse;

  if ("error" in data) {
    throw new Error(
      `Aviation Stack API error: ${data.error.message} (code: ${data.error.code})`,
    );
  }

  return data;
};
