import { JSONObject } from "@hashintel/block-protocol";
import { Client, ClientOptions } from "@opensearch-project/opensearch";
import { DataSource } from "apollo-datasource";

import { waitFor } from "../timers";
import { Logger } from "../logger";
import { SearchAdapter, SearchResult, SearchHit } from "./adapter";

export type OpenSearchConfig = {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
  httpsEnabled: boolean;
  maxConnectionAttempts?: number;
};

/**
 * `OpenSearch` is an implementation of the `SearchAdapter` infterface for the
 * OpenSearch.org search index. Use `OpenSearch.connect` to open a connection to a
 * cluster.
 * */
export class OpenSearch extends DataSource implements SearchAdapter {
  private constructor(private client: Client, private logger: Logger) {
    super();
  }

  /** Connect to an OpenSearch cluster using the provided configuration. */
  static async connect(
    logger: Logger,
    cfg: OpenSearchConfig,
  ): Promise<OpenSearch> {
    const protocol = cfg.httpsEnabled ? "https" : "http";
    const node = `${protocol}://${cfg.host}:${cfg.port}/`;
    const attempts = cfg.maxConnectionAttempts || 10;
    if (attempts < 1) {
      throw new Error("config maxConnectionAttempts must be at least 1");
    }
    const retryIntervalMillis = 5_000;
    const opts: ClientOptions = { node };
    if (cfg.auth) {
      opts.auth = cfg.auth;
    }
    let connErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const client = new Client(opts);
        await client.ping();
        logger.info(`Connected to OpenSearch cluster at ${node}`);
        return new OpenSearch(client, logger);
      } catch (err) {
        connErr = err;
        logger.info({
          message: `Unable to connect to OpenSearch cluster at ${node} (attempt ${
            i + 1
          }/${attempts}). Trying again in ${
            retryIntervalMillis / 1000
          } seconds`,
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
   * Delete an index. Does nothing if the index does not exist.
   * @param params.index the name of the index.
   */
  async deleteIndex(params: { index: string }) {
    await this.client.indices.delete({
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

  /** Implements the `index` interface on `SearchAdatper`. */
  async index(params: { index: string; id: string; body: object }) {
    await this.client.index(params);
  }

  /** Implements the `search` interface on `SearchAdapter`. */
  async search(params: {
    index: string;
    field: string;
    query: string | number | boolean | Date;
  }): Promise<SearchResult> {
    // Peform a "match" query. There are many other query types in OpenSearch but,
    // "match" is the standard for full-text search. For more, see the following:
    // https://opensearch.org/docs/latest/opensearch/query-dsl/full-text
    // https://www.elastic.co/guide/en/elasticsearch/reference/current/full-text-queries.html

    // @todo: investigate setting the text analyzer. For more see:
    // https://www.elastic.co/guide/en/elasticsearch/reference/current/specify-analyzer.html#specify-index-time-analyzer

    // @todo: for incremental search, using the "match_bool_prefix" search method may
    // be applicable. Experiment with this and expose it as an "incremental" option on
    // the interface.

    const resp = await this.client.search({
      index: params.index,
      body: {
        query: {
          match: {
            [params.field]: {
              query: params.query,
              // https://www.elastic.co/guide/en/elasticsearch/reference/current/common-options.html#fuzziness
              fuzziness: "AUTO",
              // Match any word in the phrase. We could use the "query_string" search
              // method to expose custom query logic to the client. For example:
              // "((new york) AND (city)) OR (the big apple)". For more see:
              operator: "OR",
            },
          },
        },
      },
    });

    const { body, statusCode } = resp;
    if (statusCode !== 200) {
      // @todo: could have inspect the response for the tyep of error -- e.g. index
      // does not exist
      throw new Error(JSON.stringify(resp));
    }

    const hits = body.hits.hits.map(
      (hit: any): SearchHit => ({
        index: hit._index as string,
        id: hit._id as string,
        score: hit._score as number,
        document: hit._source as JSONObject,
      }),
    );

    return { hits };
  }
}
