import { inspect } from "node:util";

import {
  Configuration,
  GraphApi as GraphApiClient,
} from "@local/hash-graph-client";
import type { Status } from "@local/status";
import { convertHttpCodeToStatusCode, isStatus } from "@local/status";
import type { ErrorInfo } from "@local/status/type-defs/status-payloads/error-info";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import type { DataSource } from "apollo-datasource";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import axios from "axios";

import type { Logger } from "./logger.js";

type GraphApi = GraphApiClient & DataSource;

const agentConfig = {
  maxSockets: 128,
  maxFreeSockets: 20,
  timeout: 60 * 1000, // ms
  freeSocketTimeout: 30 * 1000, // ms
};
const httpAgent = new HttpAgent(agentConfig);
const httpsAgent = new HttpsAgent(agentConfig);

type GraphStatus = Status<Record<string, unknown>>;

const isErrorAxiosError = (error: Error): error is AxiosError =>
  (error as AxiosError).isAxiosError;

class GraphApiError extends Error {
  status: GraphStatus;

  /**
   * Constructs a `GraphApiError` from an Axios error.
   *
   * @param axiosError
   * @throws {Error} if the Axios error does not contain a response from the Graph API, (e.g. if
   *   there was a local error while trying to send the request to the Graph API) as this is a local
   *   error and not a Graph API error.
   */
  constructor(axiosError: AxiosError) {
    const responseData = axiosError.response?.data;

    /*
     * @todo - Once we start attaching and logging better information about requests (e.g. span traces) we should
     *   generate and attached a `RequestInfo` instance to these.
     */

    if (axiosError.response) {
      if (isStatus(responseData)) {
        super(responseData.message);
        this.status = responseData as GraphStatus;
      } else if (typeof responseData === "string") {
        const message = `Error from Graph API: ${responseData}`;
        super(message);
        const errorInfo: ErrorInfo = {
          reason: "UNKNOWN",
          domain: "HASH Graph",
          metadata: {},
        };
        this.status = {
          message: responseData,
          code: convertHttpCodeToStatusCode(axiosError.response.status),
          contents: [errorInfo],
        };
      } else {
        throw new Error(
          `Unknown response format from Graph API: ${inspect(responseData)}`,
        );
      }
    } else {
      throw new Error("No response found in Graph API error.");
    }
  }
}

export const createGraphClient = (
  _logger: Logger,
  {
    host,
    port,
    requestInterceptor,
  }: {
    host: string;
    port: number;
    requestInterceptor?: (
      value: InternalAxiosRequestConfig,
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
  },
): GraphApi => {
  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

  if (requestInterceptor) {
    axiosInstance.interceptors.request.use(requestInterceptor);
  }
  axiosInstance.interceptors.response.use(
    (response) => response,
    (error: Error) => {
      if (!isErrorAxiosError(error)) {
        throw new Error(
          `Unknown error encountered while querying the graph, was not an Axios Error: ${error.toString()}`,
        );
      }
      try {
        const graphApiError = new GraphApiError(error);
        return Promise.reject(graphApiError);
      } catch (secondaryError) {
        // the error was apparently not a valid error from the Graph API, construct a local one
        /* @todo - Do we want to have the same structure as the `GraphApiError` here? */
        /* @todo - Do we have any useful information we can extract from `response.request`? */
        return Promise.reject(
          new Error(
            `Encountered an error while calling the Graph API, which wasn't identified as coming from the Graph API: ${
              (secondaryError as Error).message
            },`,
          ),
        );
      }
    },
  );

  const basePath = `http://${host}:${port}`;

  const config = new Configuration({ basePath });

  const graphApi = new GraphApiClient(config, basePath, axiosInstance);

  return graphApi;
};
