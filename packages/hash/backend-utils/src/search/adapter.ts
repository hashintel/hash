import { JsonObject } from "@blockprotocol/core";
import { DataSource } from "apollo-datasource";

export type SearchHit = {
  /** The ID of the document matching the query.  */
  id: string;
  /** The name of the index containing the document. */
  index: string;
  /** The score attributed to the match. A number in the interval [0, 1]. */
  score: number;
  /** The content of the document. */
  document: JsonObject;
};

export type SearchResult = {
  hits: SearchHit[];
};

export type SearchCursor = string;

/**
 * For paginated search results, a cursor is returned if more pages of results are present.
 */
export type SearchResultPaginated = SearchResult & {
  cursor?: SearchCursor;
  total: number;
  pageCount: number;
};

export type SearchFieldPresence = "must" | "must_not" | "should" | "filter";

/**
 * Wrapper for declaratively defining OpenSearch queries
 */
export type SearchField = {
  query: string | number | boolean | Date;
  /**
   * Number of character edits that can be done to allow a match.
   * Alternatively "AUTO" to let OpenSearch decide.
   * https://opensearch.org/docs/latest/opensearch/query-dsl/full-text/
   */
  fuzziness: number | "AUTO";
  /**
   * Whether all terms need to match (and) or only one term needs to match (or) for a document to be considered a match.
   */
  operator: "or" | "and";

  /**
   * Boolean presence operators.
   * Allows for defining how the search field is present in the search result
   * for example "must" defined that is has be be a part of the result while "should" marks it as optional
   * see https://opensearch.org/docs/latest/opensearch/query-dsl/bool/
   * @default "must"
   */
  presence?: SearchFieldPresence;
};

/**
 * OpenSearch search parameters that allow a subset of search DSL, see {@link SearchField}
 */
export type SearchParameters = {
  index: string;
  fields: { [_: string]: SearchField };
};

/** `SearchAdapter` specifies a generic interface to a search index. */
export interface SearchAdapter extends DataSource {
  /**
   * Close the connection to the search adapter.
   */
  close(): Promise<void>;

  /**
   * Add a document to a search index.
   * @param params.index the name of the search index.
   * @param params.id the document ID.
   * @param params.body the body of the document to index.
   * */
  index(params: { index: string; id: string; body: object }): Promise<void>;

  /**
   * Perform a full-text search on the given index.
   * @param params.index the name of the search index.
   * @param params.field the document field to search.
   * @param params.query the value to search for in the provided `field`.
   * */
  search(params: SearchParameters): Promise<SearchResult>;

  /**
   * Perform a full-text, paginated search on the given index.
   * @param params.pageSize maximum amount of hits to return per page
   * @param params.index the name of the search index.
   * @param params.field the document field to search.
   * @param params.query the value to search for in the provided `field`.
   * */
  startPaginatedSearch(
    params: SearchParameters & { pageSize: number },
  ): Promise<SearchResultPaginated>;

  /**
   * Continue paginating given a cursor
   * @param params.cursor the search cursor to fetch hits from
   * */
  continuePaginatedSearch(params: {
    cursor: SearchCursor;
  }): Promise<SearchResultPaginated>;
}
