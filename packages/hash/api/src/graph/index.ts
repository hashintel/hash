import { DataSource } from "apollo-datasource";
import {
  Configuration,
  GraphApi as GraphApiClient,
} from "@hashintel/hash-graph-client";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import axios from "axios";
import { Logger } from "@hashintel/hash-backend-utils/logger";

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
  { basePath }: { basePath: string },
): GraphApi => {
  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

  const config = new Configuration({ basePath });

  return new GraphApiClient(config, basePath, axiosInstance);
};
