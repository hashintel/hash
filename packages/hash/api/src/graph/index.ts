import { DataSource } from "apollo-datasource";
import { Configuration, GraphApi } from "@hashintel/hash-graph-client";
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

export const createGraphClient = (
  { host, port }: { host: string; port: number },
  _logger: Logger,
): GraphApi & DataSource => {
  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

  const basePath = `http://${host}:${port}`;

  const config = new Configuration({ basePath });

  return new GraphApi(config, basePath, axiosInstance);
};
