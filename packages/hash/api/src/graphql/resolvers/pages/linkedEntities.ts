import { ApolloError } from "apollo-server-express";
import {
  Page,
  UnresolvedGQLPage,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

const contents: Resolver<
  Promise<UnresolvedGQLUnknownEntity[]>,
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

  const blocks = await page.getBlocks(db);

  return blocks.map((block) => block.toGQLUnknownEntity());
};

export const pageLinkedEntities = {
  contents,
};
