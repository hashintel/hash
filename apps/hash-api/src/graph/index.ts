import { inspect } from "node:util";

import { GraphStatus } from "@apps/hash-graph/type-defs/status";
import { ErrorInfo } from "@apps/hash-graph/type-defs/status-payloads";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  Configuration,
  GraphApi as GraphApiClient,
  GraphResolveDepths,
} from "@local/hash-graph-client";
import { convertHttpCodeToStatusCode, isStatus } from "@local/status";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import { DataSource } from "apollo-datasource";
import axios, { AxiosError } from "axios";

import { UploadableStorageProvider } from "../storage";
import { ensureSystemEntitiesExists } from "./system-entities";
import { ensureSystemTypesExist } from "./system-types";
import {
  ensureSystemUserAccountIdExists,
  ensureSystemUserExists,
} from "./system-user";

export type ImpureGraphContext = {
  graphApi: GraphApi;
  uploadProvider: UploadableStorageProvider;
  /** @todo: add logger? */
};

export type ImpureGraphFunction<Parameters, ReturnType> = (
  context: ImpureGraphContext,
  params: Parameters,
) => ReturnType;

export type PureGraphFunction<Parameters, ReturnType> = (
  params: Parameters,
) => ReturnType;

export const zeroedGraphResolveDepths: GraphResolveDepths = {
  inheritsFrom: { outgoing: 0 },
  constrainsValuesOn: { outgoing: 0 },
  constrainsPropertiesOn: { outgoing: 0 },
  constrainsLinksOn: { outgoing: 0 },
  constrainsLinkDestinationsOn: { outgoing: 0 },
  isOfType: { outgoing: 0 },
  hasLeftEntity: { incoming: 0, outgoing: 0 },
  hasRightEntity: { incoming: 0, outgoing: 0 },
};

const agentConfig = {
  maxSockets: 128,
  maxFreeSockets: 20,
  timeout: 60 * 1000, // ms
  freeSocketTimeout: 30 * 1000, // ms
};

const httpAgent = new HttpAgent(agentConfig);
const httpsAgent = new HttpsAgent(agentConfig);

export type GraphApi = GraphApiClient & DataSource;

const isErrorAxiosError = (error: Error): error is AxiosError =>
  (error as AxiosError).isAxiosError;

export class GraphApiError extends Error {
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
  { host, port }: { host: string; port: number },
): GraphApi => {
  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

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
            "Encountered an error while calling the Graph API, which wasn't identified as coming from the Graph API.",
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

export const ensureSystemGraphIsInitialized = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  await ensureSystemUserAccountIdExists(params);

  await ensureSystemTypesExist(params);

  await ensureSystemUserExists(params);

  await ensureSystemEntitiesExists(params);
};
