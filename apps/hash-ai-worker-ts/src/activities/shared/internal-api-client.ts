import {
  Configuration,
  DefaultApi as InternalApiClient,
} from "@local/internal-api-client";
import axios from "axios";

const basePath = process.env.INTERNAL_API_HOST ?? "http://localhost:5002";

const internalApiKey = process.env.INTERNAL_API_KEY;

if (!internalApiKey) {
  throw new Error("INTERNAL_API_KEY is required");
}

const config = new Configuration({ basePath });

/**
 * Manually create the axios instance so that the internal
 * API key doesn't have to be specified when making requests.
 */
const axiosInstance = axios.create({
  headers: { "internal-api-key": internalApiKey },
});

export const internalApi = new InternalApiClient(
  config,
  basePath,
  axiosInstance,
);
