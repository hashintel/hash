import { Client, ClientOptions } from "@opensearch-project/opensearch";

import { waitFor } from "@hashintel/hash-backend-utils/timers";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { SearchAdapter } from "./adapter";

export type OpenSearchConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  httpsEnabled: boolean;
  maxConnectionRetries?: number;
};

/**
 * `OpenSearch` is an implementation of the `SearchAdapter` infterface for the
 * OpenSearch.org search index. Use `OpenSearch.connect` to open a connection to a
 * cluster.
 * */
export class OpenSearch implements SearchAdapter {
  private constructor(private client: Client) {}

  /** Connect to an OpenSearch cluster using the provided configuration. */
  static async connect(
    logger: Logger,
    cfg: OpenSearchConfig
  ): Promise<OpenSearch> {
    const protocol = cfg.httpsEnabled ? "https" : "http";
    const node = `${protocol}://${cfg.host}:${cfg.port}/`;
    const retries = cfg.maxConnectionRetries || 10;
    const retryIntervalMillis = 5_000;
    const opts: ClientOptions = {
      node,
      auth: {
        username: cfg.username,
        password: cfg.password,
      },
    };
    let connErr;
    for (let i = 0; i < retries; i++) {
      try {
        const client = new Client(opts);
        await client.ping();
        logger.info(`Connected to OpenSearch cluster at ${node}`);
        return new OpenSearch(client);
      } catch (err) {
        connErr = err;
        logger.info({
          message: `Unable to connect to OpenSearch cluster at ${node} (attempt ${
            i + 1
          }/${retries}). Trying again in ${retryIntervalMillis / 1000} seconds`,
          error: err,
        });
        await waitFor(retryIntervalMillis);
      }
    }
    throw new Error(`connecting to OpenSearch: ${connErr}`);
  }

  /** Close the connection to the OpenSearch cluster. */
  async close() {
    await this.client.close();
  }

  /**
   * Create a new index.
   * @param params.index the name of the index.
   * @todo: should be able to define type mappings here. Currently just creating an
   * index with a dynamic mapping.
   * */
  async createIndex(params: { index: string }) {
    await this.client.indices.create({
      index: params.index,
    });
  }

  /**
   * Check if an index exists.
   * @param params.index the name of the index.
   * */
  async indexExists(params: { index: string }): Promise<boolean> {
    const resp = await this.client.indices.exists(params);
    return resp.statusCode === 200;
  }

  async index(params: { index: string; id: string; body: object }) {
    await this.client.index(params);
  }
}
