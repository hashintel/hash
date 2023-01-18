import {
  Configuration,
  GraphApi as GraphApiClient,
  GraphResolveDepths,
} from "@hashintel/hash-graph-client";
import { Logger } from "@local/hash-backend-utils/logger";
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

type JSONValue =
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | Array<JSONValue>;

export class GraphApiError extends Error {
  // `status` is the HTTP status code from the server response
  status?: number;
  // `payload` is the contents of the HTTP body from the server response
  payload: JSONValue;

  constructor(axiosError: AxiosError) {
    const responseData = axiosError.response?.data;

    const message = `GraphApi error: ${
      typeof responseData === "string" ? responseData : axiosError.message
    }`;

    super(message);

    this.status = axiosError.response?.status;

    if (!responseData) {
      throw new Error("No response data found in Graph API error.");
    }

    this.payload = responseData as JSONValue;
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
        throw new Error("Graph error is not axios error");
      }

      const graphApiError = new GraphApiError(error);

      return Promise.reject(graphApiError);
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
