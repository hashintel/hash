import { ApolloError } from "apollo-server-express";
import {
  Page,
  UnresolvedGQLPage,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { ResolverFn, Scalars } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

const contents: ResolverFn<
  Promise<UnresolvedGQLUnknownEntity[]>,
  UnresolvedGQLPage,
  GraphQLContext,
  {}
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

const parentPage: ResolverFn<
  Promise<UnresolvedGQLUnknownEntity | null>,
  UnresolvedGQLPage,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources: { db } }) => {
  const page = await Page.getPageById(db, { accountId, entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const parentPageEntity = await page.getParentPage(db);

  return parentPageEntity?.toGQLUnknownEntity() ?? null;
};

const parentPageEntityId: ResolverFn<
  Promise<Scalars["ID"] | null>,
  UnresolvedGQLPage,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, _, { dataSources: { db } }) => {
  const page = await Page.getPageById(db, { accountId, entityId });

  if (!page) {
    throw new ApolloError(
      `Page with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const parentPageEntity = await page.getParentPage(db);

  return parentPageEntity?.entityId ?? null;
};

export const pageLinkedEntities = {
  contents,
  parentPage,
  parentPageEntityId,
};
