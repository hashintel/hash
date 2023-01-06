import { JsonObject } from "@blockprotocol/core";
import { Client, ClientOptions, errors } from "@opensearch-project/opensearch";
import { DataSource } from "apollo-datasource";

import { Logger } from "../logger";
import { sleep } from "../utils";
import {
  SearchAdapter,
  SearchField,
  SearchFieldPresence,
  SearchHit,
  SearchParameters,
  SearchResult,
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
type OpenSearchCursorExtension = {
  seenCount: number;
  pageSize: number;
  openSearchCursor: string;
};

type RawHit = {
  _index: string;
  _id: string;
  _score: number;
  _source: JsonObject;
};

const opaqueCursorToString = (params: OpenSearchCursorExtension): string =>
  Buffer.from(JSON.stringify(params)).toString("base64");

const opaqueCursorParse = (cursor: string): OpenSearchCursorExtension =>
  JSON.parse(
    Buffer.from(cursor, "base64").toString(),
  ) as OpenSearchCursorExtension;

const generateSearchBody = (params: SearchParameters) => {
  const fields = Object.entries(params.fields);
  if (
    fields.some(
      ([_, it]) =>
        it.fuzziness !== "AUTO" &&
        (!Number.isInteger(it.fuzziness) || it.fuzziness < 0),
    )
  ) {
    throw new Error(`Fuzziness must be a non-negative integer or "AUTO"`);
  }

  // Construct a boolean query expression
  // see https://opensearch.org/docs/latest/opensearch/query-dsl/bool/ for more info
  const clauses = fields
    .map<
      [SearchFieldPresence, { [k in string]: Omit<SearchField, "presence"> }]
    >(([fieldName, { presence, fuzziness, operator, query }]) => [
      presence ?? ("must" as const),
      { [fieldName]: { fuzziness, operator, query } },
    ])
    .reduce<
      Record<
        string,
        { match: { [k in string]: Omit<SearchField, "presence"> } }[]
      >
    >((state, [presence, field]) => {
      // Match any word in the phrase. We could use the "query_string" search
      // method to expose custom query logic to the client. For example:
      // "((new york) AND (city)) OR (the big apple)". For more see:
      // https://opensearch.org/docs/latest/opensearch/query-dsl/full-text/#query-string
      const matchField = { match: field };
      if (!state[presence]) {
        // eslint-disable-next-line no-param-reassign
        state[presence] = [matchField];
      } else {
        state[presence]!.push(matchField);
      }
      return state;
    }, {});

  return {
    query: {
      bool: {
        ...clauses,
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
  constructor(private client: Client, private logger: Logger) {
    super();
  }

  /** Connect to an OpenSearch cluster using the provided configuration. */
  static async connect(
    logger: Logger,
    cfg: OpenSearchConfig,
  ): Promise<OpenSearch> {
    const protocol = cfg.httpsEnabled ? "https" : "http";
    const node = `${protocol}://${cfg.host}:${cfg.port}/`;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we want to override 0
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
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- error stringification may need improvement
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
      body: generateSearchBody(params),
    });

    const { body, statusCode } = resp;
    if (statusCode !== 200) {
      // @todo: could have inspect the response for the tyep of error -- e.g. index
      // does not exist
      throw new Error(JSON.stringify(resp));
    }

    const hits = (body.hits.hits as RawHit[]).map(
      (hit: any): SearchHit => ({
        index: hit._index as string,
        id: hit._id as string,
        score: hit._score as number,
        document: hit._source as JsonObject,
      }),
    );

    return { hits };
  }

  private async clearScrollAndReturnUndefined(cursor: string) {
    await this.client.clear_scroll({ scroll_id: cursor });
    return undefined;
  }

  /**
   * Decide whether to increment the search cursor or to clear it.
   * If there are no more pages left (we've seen all `total` hits) then clear
   *
   * @param params.hitCount number of hits in the result
   * @param params.seenCount number of hits seen so far (not including the newly seen)
   * @param params.total  number of hits for the whole search
   * @param params.openSearchCursor cursor used to receive the current result
   * @param params.nextOpenSearchCursor cursor to retrieve results after the current results
   * @returns a search cursor that contain more data or `undefined`
   */
  private async incrementOrClearOpenSearchCursor(params: {
    pageSize: number;
    hitCount: number;
    seenCount: number;
    total: number;
    openSearchCursor: string;
    nextOpenSearchCursor: string | undefined;
  }) {
    const {
      hitCount,
      nextOpenSearchCursor,
      openSearchCursor,
      seenCount,
      total,
      pageSize,
    } = params;
    const seenSoFar = seenCount + hitCount;

    const endOfSearch =
      hitCount === 0 ||
      nextOpenSearchCursor === undefined ||
      seenSoFar >= total;

    if (endOfSearch) {
      return await this.clearScrollAndReturnUndefined(openSearchCursor);
    }

    /**
     * The next cursor requires the page to have hits and that a OpenSearch cursor exists.
     * We close the current cursor if we're at the end of pagination - this does not happen automatically.
     */
    const nextCursor =
      nextOpenSearchCursor && seenSoFar < total
        ? opaqueCursorToString({
            seenCount: seenSoFar,
            openSearchCursor: nextOpenSearchCursor,
            pageSize,
          })
        : await this.clearScrollAndReturnUndefined(openSearchCursor);

    // Only return a new search cursor if this is not the final page
    // If there are not hits in the page, the newCursor will be undefined as well.
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
   * it should be replaced with a custom pagination technique as described
   * in the end of the following section in documentation
   * https://opensearch.org/docs/latest/opensearch/ux/#sort-results
   * "search contexts consume a lot of memory"
   */
  async startPaginatedSearch(
    params: Parameters<SearchAdapter["startPaginatedSearch"]>[0],
  ): Promise<SearchResultPaginated> {
    const bodyQuery = {
      size: params.pageSize,
      ...generateSearchBody(params),
    };
    // When a new paginated search is instantiated
    const resp = await this.client.search({
      index: params.index,
      scroll: KEEP_ALIVE_CURSOR_DURATION,
      // Adds hits.total property to response
      body: bodyQuery,
    });

    const { body, statusCode } = resp;
    if (statusCode !== 200) {
      // @todo: could inspect the response for the type of error -- e.g. index
      // does not exist
      throw new Error(JSON.stringify(resp));
    }

    const hits = (body.hits.hits as RawHit[]).map(
      (hit): SearchHit => ({
        index: hit._index,
        id: hit._id,
        score: hit._score,
        document: hit._source,
      }),
    );

    const total = body.hits.total.value as number;

    // Only return a new search cursor if this is not the final page
    const newCursor = await this.incrementOrClearOpenSearchCursor({
      pageSize: params.pageSize,
      hitCount: hits.length,
      seenCount: 0,
      total,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      openSearchCursor: body._scroll_id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      nextOpenSearchCursor: body._scroll_id,
    });

    return {
      hits,
      cursor: newCursor,
      total,
      pageCount: Math.ceil(total / params.pageSize),
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
    const { seenCount, openSearchCursor, pageSize } = opaqueCursorParse(cursor);

    // When a search is continued
    let resp;
    try {
      resp = await this.client.scroll({
        scroll: KEEP_ALIVE_CURSOR_DURATION,
        scroll_id: openSearchCursor,
      });
    } catch (ex) {
      if (ex instanceof errors.ResponseError && ex.statusCode === 404) {
        throw new Error(
          "OpenSearch could not execute query. Perhaps the cursor is closed or the query is malformed?",
        );
      }
      throw ex;
    }

    const { body, statusCode } = resp;
    if (statusCode !== 200) {
      // @todo: could have inspect the response for the tyep of error -- e.g. index
      // does not exist
      throw new Error(JSON.stringify(resp));
    }

    const hits = (body.hits.hits as RawHit[]).map(
      (hit: any): SearchHit => ({
        index: hit._index as string,
        id: hit._id as string,
        score: hit._score as number,
        document: hit._source as JsonObject,
      }),
    );

    const total = body.hits.total.value as number;

    const newCursor = await this.incrementOrClearOpenSearchCursor({
      pageSize,
      hitCount: hits.length,
      seenCount,
      total,
      openSearchCursor,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      nextOpenSearchCursor: body._scroll_id,
    });

    return {
      hits,
      cursor: newCursor,
      total,
      pageCount: Math.ceil(total / pageSize),
    };
  }
}
