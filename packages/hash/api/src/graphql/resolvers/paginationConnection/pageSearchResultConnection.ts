import { ApolloError, UserInputError } from "apollo-server-express";
import {
  ENTITIES_SEARCH_FIELD,
  ENTITIES_SEARCH_INDEX,
  EntitiesDocument,
} from "@hashintel/hash-backend-utils/search/doc-types";
import { SearchHit } from "@hashintel/hash-backend-utils/search/adapter";

import {
  Resolver,
  QueryPageSearchResultConnectionArgs,
  PageSearchResultConnection,
  PageSearchResult,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

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

  if (!query && !after) {
    throw new UserInputError(
      "Please provide one of 'query' or 'after' in the parameters.",
    );
  }

  // @todo text.model.ts model class should replace this manual adapter call.
  const textType = await db.getSystemTypeLatestVersion({
    systemTypeName: "Text",
  });

  let hits: SearchHit[] = [];
  let pageCount: number;
  let cursor: string | undefined;

  if (after) {
    ({ hits, cursor, pageCount } = await search.continuePaginatedSearch({
      cursor: after,
    }));
  } else if (query && pageSize) {
    ({ hits, cursor, pageCount } = await search.startPaginatedSearch({
      pageSize,
      index: ENTITIES_SEARCH_INDEX,
      fields: {
        [ENTITIES_SEARCH_FIELD]: {
          query,
          fuzziness: "AUTO",
          operator: "or",
          presence: "must",
        },
        // Only fetch entities with the "Text" system type.
        // These will contain a "belongsToParent" property
        entityTypeId: {
          query: textType.entityId,
          fuzziness: 0,
          operator: "and",
          presence: "must",
        },
        "belongsToPage.accountId": {
          query: accountId,
          fuzziness: 0,
          operator: "and",
          presence: "must",
        },
      },
    }));
  } else {
    throw new UserInputError(
      "Could not execute search. Please supply one of (i) 'after' OR (ii) 'query' with an optional non-zero 'pageSize'.",
    );
  }

  /**
   * @todo: filtering already happens in the search index, this filtering should be redundant.
   * it is used for type assertion only.
   */
  const textMatches = hits
    .filter(
      (hit): hit is TextSearchHit =>
        hit.document.entityTypeId === textType.entityId,
    )
    .map(
      (it) =>
        <PageSearchResult>{
          score: it.score,
          page: it.document.belongsToPage!,
          /**
           * @todo: Currently we are not getting the (parent) block of a text system type in the search-loader
           * This means that scrolling to a block after selecting a search hit is not possible even though
           * the API implies it is. We will need to implement indexing of the "parent block" within the search-loader.
           */
          block: undefined,
          text: {
            accountId: it.document.accountId,
            entityId: it.document.entityId,
            entityVersionId: it.document.entityTypeVersionId,
          },
          content: it.document.fullTextSearch || "",
        },
    )
    .sort((matchA, matchB) => matchB.score - matchA.score);

  // @todo: check for matches on Page titles.

  return {
    edges: textMatches.map((match) => ({
      node: match,
    })),
    pageInfo: {
      hasNextPage: cursor !== undefined,
      nextPageCursor: cursor,
      pageCount,
    },
  };
};
