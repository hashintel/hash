import { JSONObject } from "blockprotocol";
import { Client, ClientOptions } from "@opensearch-project/opensearch";
import { DataSource } from "apollo-datasource";

import { sleep } from "@hashintel/hash-shared/sleep";
import { Logger } from "../logger";
import {
  SearchAdapter,
  SearchResult,
  SearchHit,
  SearchParameters,
  SearchResultPaginated,
} from "./adapter";

const KEEP_ALIVE_CURSOR_DURATION = "10m";

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
 * The OpenSearch pagination endpoint does not provide good context about progress.
 * OpenSearch's opaque cursor is wrapped with context in order to supply more information to users.
 * This for example allows for us to check if there there is a next page for a given query or not.
 *
 * Also used as an opaque cursor from the user's perspective.
 */
type OpenSearchCursorExtenstion = {
  seenCount: number;
  openSearchCursor: string;
};

const opaqueCursorToString = (params: OpenSearchCursorExtenstion): string =>
  Buffer.from(JSON.stringify(params)).toString("base64");

const opaqueCursorParse = (cursor: string): OpenSearchCursorExtenstion =>
  JSON.parse(Buffer.from(cursor, "base64").toString());

const searchBodyParams = (params: SearchParameters) => {
  return {
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
  };
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
        await sleep(retryIntervalMillis);
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
  async search(params: SearchParameters): Promise<SearchResult> {
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
      body: searchBodyParams(params),
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

  /**
   * Decide whether to increment the search cursor or to clear it.
   * If there are no more pages left (we've seen all `total` hits) then clear
   *
   * @param hitCount number of hits in the result
   * @param seenCount number of hits seen so far (not including the newly seen)
   * @param total  number of hits for the whole search
   * @param openSearchCursor cursor used to receive current result
   * @param nextOpenSearchCursor cursor to use after the current result
   * @returns a search cursor that contain more data or `undefined`
   */
  private async incrementOrClearOpenSearchCursor(
    hitCount: number,
    seenCount: number,
    total: number,
    openSearchCursor: string,
    nextOpenSearchCursor: string | undefined,
  ) {
    const seenSoFar = seenCount + hitCount;

    const endOfSearch =
      hitCount === 0 ||
      nextOpenSearchCursor === undefined ||
      seenSoFar >= total;

    if (endOfSearch) {
      await this.client.clear_scroll({ scroll_id: openSearchCursor });
      return undefined;
    }

    // A new cursor requires the page to have hits and a proper next cursor
    const nextCursor =
      nextOpenSearchCursor && seenSoFar < total
        ? opaqueCursorToString({
            seenCount: seenSoFar,
            openSearchCursor: nextOpenSearchCursor,
          })
        : undefined;

    // Only return a new search cursor if this is not the final page
    // If there are not hits in the page, the newCursor will be undefiend as well.
    return seenCount < total ? nextCursor : undefined;
  }

  /**
   * Initiate paginated search with search parameters
   * The current implementation makes use of OpenSearch Scroll,
   * which stores search results in a context in the OpenSearch server.
   *
   * The cursor is kept alive for 10 minutes.
   *
   * If this impacts performance when having many users,
   * it should be replaces with a custom pagination technique as described
   * in the end of the following section in documentation
   * https://opensearch.org/docs/latest/opensearch/ux/#sort-results
   * "search contexts consume a lot of memory"
   */
  async startPaginatedSearch(
    params: Parameters<SearchAdapter["startPaginatedSearch"]>[0],
  ): Promise<SearchResultPaginated> {
    // When a new paginated search is instantiated
    const resp = await this.client.search({
      index: params.index,
      scroll: KEEP_ALIVE_CURSOR_DURATION,
      // Adds hits.total property to response
      body: {
        size: params.pageSize,
        ...searchBodyParams(params),
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

    const total = body.hits.total.value as number;

    // Only return a new search cursor if this is not the final page
    const newCursor = await this.incrementOrClearOpenSearchCursor(
      hits.length as number,
      0,
      total,
      body._scroll_id,
      body._scroll_id,
    );

    return {
      hits,
      cursor: newCursor,
      total,
    };
  }

  /**
   * Continue paginated search with a search cursor
   * The cursor is kept alive for 10 minutes.
   */
  async continuePaginatedSearch({
    cursor,
  }: Parameters<
    SearchAdapter["continuePaginatedSearch"]
  >[0]): Promise<SearchResultPaginated> {
    const { seenCount, openSearchCursor } = opaqueCursorParse(cursor);

    // When a search is continued
    const resp = await this.client.scroll({
      scroll: KEEP_ALIVE_CURSOR_DURATION,
      scroll_id: openSearchCursor,
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

    const total = body.hits.total.value as number;

    const newCursor = await this.incrementOrClearOpenSearchCursor(
      hits.length as number,
      seenCount,
      total,
      openSearchCursor,
      body._scroll_id,
    );

    return {
      hits,
      cursor: newCursor,
      total,
    };
  }
}
