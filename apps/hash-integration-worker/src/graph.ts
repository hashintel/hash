import { Logger } from "@local/hash-backend-utils/logger";
import { Configuration, GraphApi } from "@local/hash-graph-client";
import HttpAgent, { HttpsAgent } from "agentkeepalive";
import axios from "axios";

// TODO: Mostly copied from `hash-api`. Instead of importing `hash-api` or reimplementing the logic here we should
//       probably move out shared code into a separate package.
export const createGraphClient = (
  _logger: Logger,
  { host, port }: { host: string; port: number },
): GraphApi => {
  const agentConfig = {
    maxSockets: 128,
    maxFreeSockets: 20,
    timeout: 60 * 1000, // ms
    freeSocketTimeout: 30 * 1000, // ms
  };

  const httpAgent = new HttpAgent(agentConfig);
  const httpsAgent = new HttpsAgent(agentConfig);

  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
  });

  axiosInstance.interceptors.response.use(
    (response) => response,
    (error: Error) => {
      // TODO: Error handling, we maybe can reuse the error handling from `hash-api` and improve that instead of
      //       reimplementing it here.
      return Promise.reject(error);
    },
  );

  const basePath = `http://${host}:${port}`;

  const config = new Configuration({ basePath });

  return new GraphApi(config, basePath, axiosInstance);
};
