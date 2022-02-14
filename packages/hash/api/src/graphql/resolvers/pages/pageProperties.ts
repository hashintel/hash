import { ApolloError } from "apollo-server-express";
import {
  Page,
  UnresolvedGQLPage,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import {
  PageProperties as GQLPageProperties,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

/**
 * IMPORTANT NOTE: this is a temporary field resolver and will be deprecated
 * once API consumers have been refactored to stop accessing `properties.contents`
 * of a Page, and access these using the `linkGroups` or `contents` fields instead
 */
export const pageProperties: Resolver<
  Promise<
    Omit<GQLPageProperties, "contents"> & {
      contents: UnresolvedGQLUnknownEntity[];
    }
  >,
  UnresolvedGQLPage,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const { db } = dataSources;
  const page = await Page.getPageById(db, { accountId, entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const blocks = await page.getBlocks(dataSources.db);

  return {
    ...page.properties,
    // Legacy field of `block.properties`
    contents: blocks.map((block) => block.toGQLUnknownEntity()),
  };
};
