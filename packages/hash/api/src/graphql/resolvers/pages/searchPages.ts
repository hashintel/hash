import { uniq } from "lodash";
import { ApolloError, UserInputError } from "apollo-server-express";
import { EntitiesDocument } from "@hashintel/hash-backend-utils/search/doc-types";
import { SearchHit } from "@hashintel/hash-backend-utils/search/adapter";

import {
  QuerySearchPagesArgs,
  PageSearchResult,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DBAdapter } from "../../../db";
import { DbEntity } from "../../../db/adapter";
import { intersection } from "../../../util";

// The name of the search index containing entities and the document field to perform
// the search on. See the README for the `search-loader` for more details.
const ENTITIES_SEARCH_INDEX = "entities";
const ENTITIES_SEARCH_FIELD = "fullTextSearch";

type TextSearchHit = Omit<SearchHit, "document"> & {
  document: EntitiesDocument;
};

const getEntityRef = (entity: {
  accountId: string;
  entityId: string;
  entityVersionId: string;
}) => {
  return {
    accountId: entity.accountId,
    entityId: entity.entityId,
    entityVersionId: entity.entityVersionId,
  };
};

export const getPagesLinkingToTextEntities = async (
  textSearchHits: TextSearchHit[],
  db: DBAdapter,
) => {
  const scoreLookup = new Map(
    textSearchHits.map((hit) => [
      (hit.document as unknown as EntitiesDocument).entityVersionId,
      hit.score,
    ]),
  );
  /** ************************************************************************************
   * 1. Get the pages which link to each text entity, keeping only the latest versions.
   ************************************************************************************ */
  const textEntityRefs = uniq(
    textSearchHits.map(({ document: { accountId, entityId } }) => ({
      accountId,
      entityId,
    })),
  );
  // Get all ancestors at depth 2 (i.e. grandparents) from each Text entity
  const grandparentRefs = await Promise.all(
    textEntityRefs.map((ref) => db.getAncestorReferences({ ...ref, depth: 2 })),
  );
  // Get the latest version of each grandparent entity. Keep only the Page entities.
  const pageType = await db.getSystemTypeLatestVersion({
    systemTypeName: "Page",
  });
  const pageHits = await Promise.all(
    grandparentRefs.map(async (grandparents) => {
      const gps = await Promise.all(
        grandparents.map((ref) => db.getEntityLatestVersion(ref)),
      );
      return gps.filter(
        (gp): gp is DbEntity =>
          gp !== undefined && gp.entityTypeId === pageType.entityId,
      );
    }),
  );
  const pages = uniq(pageHits.flat());

  /** ************************************************************************************
   * 2. Search results only apply to the latest version of each page. We need to check
   * which pages have a latest version containing the hits for text entities retrieved
   * from the search index. Start by getting the Block entities linked to by each Page
   * from step 1.
   ************************************************************************************ */
  const blockType = await db.getSystemTypeLatestVersion({
    systemTypeName: "Block",
  });
  const blockHits = (
    await Promise.all(pages.map((page) => db.getChildren(page)))
  ).map((entities) =>
    entities.filter((entity) => entity.entityTypeId === blockType.entityId),
  );
  const pageToBlock = new Map<string, Set<string>>(
    blockHits.map((blocks, i) => [
      pages[i].entityVersionId,
      new Set(blocks.map((block) => block.entityVersionId)),
    ]),
  );

  /** ************************************************************************************
   * 3. Get the Text entity linked to by each Block from step 2.
   ************************************************************************************ */
  const blocks = uniq(blockHits.flat());
  const textType = await db.getSystemTypeLatestVersion({
    systemTypeName: "Text",
  });
  const textHits = (
    await Promise.all(blocks.map((block) => db.getChildren(block)))
  ).map((entities) =>
    entities.filter((entity) => entity.entityTypeId === textType.entityId),
  );
  const blockToText = new Map<string, Set<string>>(
    textHits.map((texts, i) => [
      blocks[i].entityVersionId,
      new Set(texts.map((text) => text.entityVersionId)),
    ]),
  );

  /** ************************************************************************************
   * 4. Using the results from steps 3 & 4, go back down the chain from Page -> Block ->
   * Text to determine which Text entity versions returned by the search index are
   * transitively linked to the latest version of a page.
   ************************************************************************************ */
  const pageLookup = new Map(pages.map((page) => [page.entityVersionId, page]));
  const blockLookup = new Map(
    blocks.map((block) => [block.entityVersionId, block]),
  );
  const textLookup = new Map(
    textSearchHits.map(({ document }) => [document.entityVersionId, document]),
  );
  const searchTextIds = new Set(
    textSearchHits.map(({ document }) => document.entityVersionId),
  );
  const results: PageSearchResult[] = [];
  for (const [pageId, blockIds] of pageToBlock.entries()) {
    const page = pageLookup.get(pageId)!;
    for (const blockId of blockIds) {
      const block = blockLookup.get(blockId)!;
      const textIds = blockToText.get(blockId)!;
      const textIdMatches = intersection(textIds, searchTextIds);
      for (const textId of textIdMatches) {
        const text = textLookup.get(textId)!;
        results.push({
          score: scoreLookup.get(text.entityVersionId)!,
          page: getEntityRef(page)!,
          block: getEntityRef(block)!,
          text: getEntityRef(text)!,
          content: text.fullTextSearch || "",
        });
      }
    }
  }

  return results;
};

export const searchPages: Resolver<
  Promise<PageSearchResult[]>,
  {},
  GraphQLContext,
  QuerySearchPagesArgs
> = async (_, { accountId, query }, ctx, __) => {
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

  // @todo: currently, the query on the index searches all entities across all accounts.
  // This is because a page may link to entities which reside in a different account to
  // that of the page. As an optimization, on the `search-loader` side, we could
  // cache which pages have a link to an entity, and only perform full-text-search on
  // those entities which have a link (direct or transitive) originating at a page
  // matching the `accountID` provided to this resolver.

  const { hits } = await search.search({
    index: ENTITIES_SEARCH_INDEX,
    fields: {
      [ENTITIES_SEARCH_FIELD]: {
        query,
        // https://www.elastic.co/guide/en/elasticsearch/reference/current/common-options.html#fuzziness
        fuzziness: "AUTO",
        // Match any word in the phrase. We could use the "query_string" search
        // method to expose custom query logic to the client. For example:
        // "((new york) AND (city)) OR (the big apple)". For more see:
        operator: "and",
      },
    },
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

  return textMatches;
};
