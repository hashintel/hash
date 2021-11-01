/** `SearchAdapter` specifies a generic interface to a search index. */
export interface SearchAdapter {
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
}
