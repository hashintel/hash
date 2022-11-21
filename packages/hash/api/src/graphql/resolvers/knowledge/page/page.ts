import { userAccountIdToEntityId } from "@hashintel/hash-shared/types";
import { EntityTypeMismatchError } from "../../../../lib/error";
import { OrgModel, PageModel, UserModel } from "../../../../model";

import {
  MutationCreatePersistedPageArgs,
  QueryPersistedPageArgs,
  QueryPersistedPageCommentsArgs,
  QueryPersistedPagesArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import {
  UnresolvedPersistedPageGQL,
  mapPageModelToGQL,
  UnresolvedPersistedCommentGQL,
  mapCommentModelToGQL,
} from "../model-mapping";

export const persistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL>,
  {},
  GraphQLContext,
  QueryPersistedPageArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
    entityVersion: entityVersion ?? undefined,
  });

  return mapPageModelToGQL(pageModel);
};

export const createPersistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePersistedPageArgs
> = async (
  _,
  { ownedById, properties: { title, prevIndex } },
  { dataSources: { graphApi }, userModel },
) => {
  const pageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title,
    prevIndex: prevIndex ?? undefined,
    actorId: userModel.entityUuid,
  });

  return mapPageModelToGQL(pageModel);
};

export const parentPersistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL | null>,
  UnresolvedPersistedPageGQL,
  GraphQLContext,
  QueryPersistedPagesArgs
> = async (page, _, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId: page.metadata.editionId.baseId,
  });
  const parentPageModel = await pageModel.getParentPage(graphApi);

  return parentPageModel ? mapPageModelToGQL(parentPageModel) : null;
};

export const persistedPages: ResolverFn<
  Promise<UnresolvedPersistedPageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPersistedPagesArgs
> = async (_, { ownedById }, { dataSources: { graphApi }, userModel }) => {
  const accountModel = ownedById
    ? await UserModel.getUserById(graphApi, {
        entityId: userAccountIdToEntityId(ownedById),
      }).catch((error: Error) => {
        if (error instanceof EntityTypeMismatchError) {
          return OrgModel.getOrgById(graphApi, {
            entityId: userAccountIdToEntityId(ownedById),
          });
        }
        throw error;
      })
    : userModel;

  const pageModels = await PageModel.getAllPagesInAccount(graphApi, {
    accountModel,
  });

  return pageModels.map(mapPageModelToGQL);
};

export const persistedPageComments: ResolverFn<
  Promise<UnresolvedPersistedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPersistedPageCommentsArgs
> = async (_, { entityId }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
  });

  const commentModels = await pageModel.getComments(graphApi);

  return commentModels.map(mapCommentModelToGQL);
};
