import { randomUUID } from "crypto";
import { Logger } from "../logger";
import { OpenSearch } from "./opensearch";

const ENTITIES_SEARCH_INDEX = "entities";
// const ENTITIES_SEARCH_FIELD = "fullTextSearch";

const stub = {
  clear_scroll: jest.fn(),
  search: jest.fn(),
  scroll: jest.fn(),
};
const openSearch: OpenSearch = new OpenSearch(
  stub as any,
  new Logger({ level: "debug", mode: "dev", serviceName: "dbg" }),
);

const generateSearchHit = (searchIndex: string, itemId: number) => ({
  _id: randomUUID(),
  _index: searchIndex,
  _score: itemId, // score is not relevant for these tests
  _source: { some: `document ${itemId}` }, // the document itself isn't either.
});

function* generateHitPage(
  totalHits: number,
  pageSize: number,
  searchIndex: string,
) {
  const hits = new Array(totalHits)
    .fill(0)
    .map((_, itemId) => generateSearchHit(searchIndex, itemId));
  const pageCount = Math.ceil(totalHits / pageSize);

  for (let page = 0; page < pageCount; page++) {
    const offset = pageCount * page;
    const residual = page + 1 === pageCount ? totalHits % pageSize : 0;
    yield {
      statusCode: 200,
      body: {
        _scroll_id: "random id",
        hits: {
          total: {
            value: totalHits,
          },
          hits: hits.slice(offset, offset + pageSize - residual),
        },
      },
    };
  }
}

describe("OpenSearch pagination", () => {
  it("can paginate a single page", async () => {
    const totalHits = 20;
    const pageSize = 20;

    const gen = generateHitPage(totalHits, pageSize, "entities");
    stub.search.mockReset().mockImplementation(() => gen.next().value);
    stub.scroll.mockReset().mockImplementation(() => gen.next().value);

    const firstPage = await openSearch.startPaginatedSearch({
      pageSize,
      field: "accountId",
      index: ENTITIES_SEARCH_INDEX,
      query: "b85dae98-b233-4880-b6bc-99424d5066b9",
    });

    expect(firstPage.cursor).toBeUndefined();
    expect(firstPage.hits).toHaveLength(pageSize);
  });

  it("can paginate two pages", async () => {
    const totalHits = 15;
    const pageSize = 10;

    const gen = generateHitPage(totalHits, pageSize, "entities");
    stub.search.mockReset().mockImplementation(() => gen.next().value);
    stub.scroll.mockReset().mockImplementation(() => gen.next().value);

    const firstPage = await openSearch.startPaginatedSearch({
      pageSize,
      field: "accountId",
      index: ENTITIES_SEARCH_INDEX,
      query: "b85dae98-b233-4880-b6bc-99424d5066b9",
    });

    const secondPage = await openSearch.continuePaginatedSearch({
      cursor: firstPage.cursor!!,
    });

    expect(firstPage.cursor).toBeDefined();
    expect(firstPage.hits).toHaveLength(pageSize);
    expect(stub.search).toBeCalledTimes(1);

    expect(secondPage.cursor).toBeUndefined();
    // residual 5 pages on the second page
    expect(secondPage.hits).toHaveLength(5);
    expect(stub.scroll).toBeCalledTimes(1);
  });

  it("can paginate many pages", async () => {
    const totalHits = 200;
    const pageSize = 20;

    const gen = generateHitPage(totalHits, pageSize, "entities");
    stub.search.mockReset().mockImplementation(() => gen.next().value);
    stub.scroll.mockReset().mockImplementation(() => gen.next().value);

    const firstPage = await openSearch.startPaginatedSearch({
      pageSize,
      field: "accountId",
      index: ENTITIES_SEARCH_INDEX,
      query: "b85dae98-b233-4880-b6bc-99424d5066b9",
    });

    let lastPage = firstPage;
    while (lastPage.cursor !== undefined) {
      const nextPage = await openSearch.continuePaginatedSearch({
        cursor: lastPage.cursor,
      });

      expect(lastPage.cursor).toBeDefined();
      expect(nextPage.hits).toHaveLength(pageSize);

      lastPage = nextPage;
    }

    expect(firstPage.cursor).toBeDefined();
    expect(firstPage.hits).toHaveLength(pageSize);
    expect(stub.search).toBeCalledTimes(1);

    // on the last iteration, the last page will must an undefined cursor.
    expect(lastPage.cursor).toBeUndefined();
    expect(stub.scroll).toBeCalledTimes(9);
  });
});
