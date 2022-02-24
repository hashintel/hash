import { DataSource } from "apollo-datasource";
import { JSONObject } from "blockprotocol";

export type SearchHit = {
  /** The ID of the document matching the query.  */
  id: string;
  /** The name of the index containing the document. */
  index: string;
  /** The score attributed to the match. A number in the interval [0, 1]. */
  score: number;
  /** The content of the document. */
  document: JSONObject;
  belongsToPage?: {
    entityId: string;
    entityVersionId: string;
    accountId: string;
  };
};

export type SearchResult = {
  hits: SearchHit[];
};

export type SearchCursor = string;

export type SearchResultPaginated = SearchResult & {
  cursor?: SearchCursor;
  total: number;
};

export type SearchParameters = {
  index: string;
  field: string;
  query: string | number | boolean | Date;
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
   * @param params.cursor the search cursor to fetch hits form
   * */
  continuePaginatedSearch(params: {
    cursor: SearchCursor;
  }): Promise<SearchResultPaginated>;
}
