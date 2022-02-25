import { ApolloError, UserInputError } from "apollo-server-express";
import { EntitiesDocument } from "@hashintel/hash-backend-utils/search/doc-types";
import { SearchHit } from "@hashintel/hash-backend-utils/search/adapter";

import {
  Resolver,
  QueryPageSearchResultConnectionArgs,
  PageSearchResultConnection,
  PageSearchResult,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

// These values are the same defined in searchPages.
// The name of the search index containing entities and the document field to perform
// the search on. See the README for the `search-loader` for more details.
const ENTITIES_SEARCH_INDEX = "entities";
const ENTITIES_SEARCH_FIELD = "fullTextSearch";

type TextSearchHit = Omit<SearchHit, "document"> & {
  document: EntitiesDocument;
};

/**
 * Paginated search over user pages.
 * Currently doesn't support searching for both user and organization pages.
 */
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

  if (query == null && after == null) {
    throw new UserInputError(
      "Please provide one of 'query' or 'after' in the parameters.",
    );
  }

  const textType = await db.getSystemTypeLatestVersion({
    systemTypeName: "Text",
  });

  let hits: SearchHit[] = [];
  let cursor: string | undefined;

  if (after) {
    ({ hits, cursor } = await search.continuePaginatedSearch({
      cursor: after,
    }));
  } else if (query && pageSize) {
    ({ hits, cursor } = await search.startPaginatedSearch({
      pageSize,
      index: ENTITIES_SEARCH_INDEX,
      fields: {
        [ENTITIES_SEARCH_FIELD]: {
          query,
          fuzziness: "AUTO",
          operator: "or",
          presence: "must",
        },
        // Only fetch entityes with the "Text" systemtype.
        // These will contain a "belongsToParent" property
        entityTypeId: {
          query: textType.entityId,
          // Fuzziness is set to 0, such that an ID that is lexicographically similar don't match
          // This filter used to be done in resolvers.
          fuzziness: 0,
          operator: "and",
          presence: "must",
        },
        "belongsToPage.accountId": {
          query: accountId,
          // Fuzziness is set to 0, such that an ID that is lexicographically similar don't match
          // This filter used to be done in resolvers.
          fuzziness: 0,
          operator: "and",
          presence: "must",
        },
      },
    }));
  } else {
    throw new UserInputError(
      "Could not execute search. Please revise arguments.",
    );
  }

  // For all text entity matches, find the pages and the blocks within those pages where
  // the text match is present. Include hits corresponding only to the latest version
  // of a page.
  // Note: we filter the resulting array to keep only those pages which match the
  // `accountId` set in the query. A page may link to entities which belong to a
  // different account to that of the page. We don't filter by the `accountId` before this
  // point as it would remove these pages with cross-account links.

  // @todo: filtering already happens in the search index, this filtering should be redundant.
  // it is used for type assertion only.
  const textHits = hits.filter(
    (hit): hit is TextSearchHit =>
      hit.document.entityTypeId === textType.entityId,
  );
  const textMatches = textHits.map(
    (it) =>
      <PageSearchResult>{
        score: it.score,
        page: it.document.belongsToPage!,
        block: undefined,
        text: {
          accountId: it.document.accountId,
          entityId: it.document.entityId,
          entityVersionId: it.document.entityTypeVersionId,
        },
        content: it.document.fullTextSearch || "",
      },
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
};
