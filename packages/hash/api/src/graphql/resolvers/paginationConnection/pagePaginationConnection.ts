import { ApolloError, UserInputError } from "apollo-server-express";
import { EntitiesDocument } from "@hashintel/hash-backend-utils/search/doc-types";
import { SearchHit } from "@hashintel/hash-backend-utils/search/adapter";
import { getPagesLinkingToTextEntities } from "../pages/searchPages";

import {
  Resolver,
  QueryPageSearchResultConnectionArgs,
  PageSearchResultConnection,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

// The name of the search index containing entities and the document field to perform
// the search on. See the README for the `search-loader` for more details.
const ENTITIES_SEARCH_INDEX = "entities";
const ENTITIES_SEARCH_FIELD = "fullTextSearch";

type TextSearchHit = Omit<SearchHit, "document"> & {
  document: EntitiesDocument;
};

export const pageSearchResultConnection: Resolver<
  Promise<PageSearchResultConnection>,
  {},
  GraphQLContext,
  QueryPageSearchResultConnectionArgs
> = async (_, { accountId, query, pageSize, after }, ctx, __) => {
  const { search, db } = ctx.dataSources;
  if (!search) {
    throw new ApolloError(
      `Search is currently disabled so this search can't return any results`,
      "INTERNAL_SERVER_ERROR",
    );
  }

  if (query === "") {
    throw new UserInputError("field 'query' cannot be empty");
  }

  if (after) {
    throw new Error("notimpl");
  } else {
    const { hits, cursor } = await search.startPaginatedSearch({
      pageSize,
      index: ENTITIES_SEARCH_INDEX,
      field: ENTITIES_SEARCH_FIELD,
      query,
    });

    // For all text entity matches, find the pages and the blocks within those pages where
    // the text match is present. Include hits corresponding only to the latest version
    // of a page.
    // Note: we filter the resulting array to keep only those pages which match the
    // `accountId` set in the query. A page may link to entities which belong to a
    // different account to that of the page. We don't filter by the `accountId` before this
    // point as it would remove these pages with cross-account links.
    const textType = await db.getSystemTypeLatestVersion({
      systemTypeName: "Text",
    });
    // @todo: we could filter by entity type in the search index (Text, Page, ...)
    const textHits = hits.filter(
      (hit): hit is TextSearchHit =>
        hit.document.entityTypeId === textType.entityId,
    );
    const textMatches = await getPagesLinkingToTextEntities(textHits, db).then(
      (matches) => matches.filter((it) => it.page.accountId === accountId),
    );
    textMatches.sort((matchA, matchB) => matchB.score - matchA.score);

    // @todo: check for matches on Page titles.

    return {
      edges: textMatches.map((match) => ({
        node: match,
      })),
      pageInfo: {
        hasNextPage: cursor !== undefined,
        nextPageCursor: cursor,
      },
    };
  }
};
