import { PageModel, UserModel } from "../../../../model";

import {
  MutationCreateKnowledgePageArgs,
  QueryKnowledgePageArgs,
  QueryKnowledgePagesArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedKnowledgePageGQL,
  mapPageModelToGQL,
} from "../model-mapping";

export const knowledgePage: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL>,
  {},
  GraphQLContext,
  QueryKnowledgePageArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
    entityVersion: entityVersion ?? undefined,
  });

  return mapPageModelToGQL(pageModel);
};

export const createKnowledgePage: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreateKnowledgePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevIndex } },
  { dataSources: { graphApi } },
) => {
  const pageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title,
    prevIndex: prevIndex ?? undefined,
  });

  return mapPageModelToGQL(pageModel);
};

export const parentKnowledgePage: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL | null>,
  UnresolvedKnowledgePageGQL,
  GraphQLContext,
  QueryKnowledgePagesArgs
> = async (page, _, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId: page.entityId,
  });
  const parentPageModel = await pageModel.getParentPage(graphApi);

  return parentPageModel ? mapPageModelToGQL(parentPageModel) : null;
};

export const knowledgePages: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryKnowledgePagesArgs
> = async (_, { ownedById }, { dataSources: { graphApi }, user }) => {
  const accountModel = ownedById
    ? await UserModel.getUserById(graphApi, { entityId: ownedById })
    : user;

  const pageModels = await PageModel.getAllPagesInAccount(graphApi, {
    accountModel,
  });

  return pageModels.map(mapPageModelToGQL);
};
