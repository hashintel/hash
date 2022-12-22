import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  Configuration,
  GraphApi as GraphApiClient,
  GraphResolveDepths,
} from "@hashintel/hash-graph-client";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import { DataSource } from "apollo-datasource";
import axios from "axios";

import { ensureSystemEntitiesExists } from "./system-entities";
import { ensureSystemTypesExist } from "./system-types";
import {
  ensureSystemUserAccountIdExists,
  ensureSystemUserExists,
} from "./system-user";

export type ImpureGraphContext = {
  graphApi: GraphApi;
  /** @todo: add logger? */
};

export type ImpureGraphFunction<Parameters, ReturnType> = (
  ctx: ImpureGraphContext,
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

export const createGraphClient = (
  _logger: Logger,
  { host, port }: { host: string; port: number },
): GraphApi => {
  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

  const basePath = `http://${host}:${port}`;

  const config = new Configuration({ basePath });

  return new GraphApiClient(config, basePath, axiosInstance);
};

export const ensureSystemGraphIsInitialized = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  await ensureSystemUserAccountIdExists(params);

  await ensureSystemTypesExist(params);

  await ensureSystemUserExists(params);

  await ensureSystemEntitiesExists(params);
};
