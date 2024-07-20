import axios, { type AxiosError } from "axios";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import {
  Configuration,
  DefaultApi as InternalApiClient,
} from "@local/internal-api-client";

const basePath = process.env.INTERNAL_API_HOST ?? "http://localhost:5002";

const internalApiKey = process.env.INTERNAL_API_KEY;

if (!isSelfHostedInstance && !internalApiKey) {
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

/**
 * Add a prefix to the errors that occur when calling the internal API,
 * to make it more clear where the error originated.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // eslint-disable-next-line no-param-reassign
    error.message = `Error occurred calling the Internal API: ${error.message}`;

    return Promise.reject(error);
  },
);

export const internalApiClient = new InternalApiClient(
  config,
  basePath,
  axiosInstance,
);
