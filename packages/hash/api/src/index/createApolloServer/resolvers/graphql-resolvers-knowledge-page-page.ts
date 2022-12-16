import {
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
  Uuid,
} from "@hashintel/hash-shared/types";

import { systemUserAccountId } from "../../auth/model/entity.model/entity-type/graph/system-user";
import { EntityTypeMismatchError } from "../../auth/model/entity.model/entity-type/graph/system-types/util/property-type/error";
import { OrgModel, PageModel, UserModel } from "../../auth/model";

import {
  MutationCreatePageArgs,
  QueryPageArgs,
  QueryPageCommentsArgs,
  QueryPagesArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "./embed/context";
import {
  UnresolvedPageGQL,
  mapPageModelToGQL,
  UnresolvedCommentGQL,
  mapCommentModelToGQL,
} from "./page/update-page-contents/model-mapping";

export const page: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  GraphQLContext,
  QueryPageArgs
> = async (_, { entityId }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
  });

  return mapPageModelToGQL(pageModel);
};

export const createPage: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (
  _,
  { ownedById, properties: { title, prevIndex } },
  { dataSources: { graphApi }, userModel },
) => {
  const pageModel = await PageModel.createPage(graphApi, {
    ownedById,
    title,
    prevIndex: prevIndex ?? undefined,
    actorId: userModel.getEntityUuid(),
  });

  return mapPageModelToGQL(pageModel);
};

export const parentPage: ResolverFn<
  Promise<UnresolvedPageGQL | null>,
  UnresolvedPageGQL,
  GraphQLContext,
  QueryPagesArgs
> = async (pageGql, _, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId: pageGql.metadata.editionId.baseId,
  });
  const parentPageModel = await pageModel.getParentPage(graphApi);

  return parentPageModel ? mapPageModelToGQL(parentPageModel) : null;
};

export const pages: ResolverFn<
  Promise<UnresolvedPageGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPagesArgs
> = async (_, { ownedById }, { dataSources: { graphApi }, userModel }) => {
  const accountEntityId = ownedById
    ? entityIdFromOwnedByIdAndEntityUuid(
        systemUserAccountId as OwnedById,
        ownedById as Uuid as EntityUuid,
      )
    : undefined;

  const accountModel = accountEntityId
    ? await UserModel.getUserById(graphApi, {
        entityId: accountEntityId,
      }).catch((error: Error) => {
        if (error instanceof EntityTypeMismatchError) {
          return OrgModel.getOrgById(graphApi, { entityId: accountEntityId });
        }
        throw error;
      })
    : userModel;

  const pageModels = await PageModel.getAllPagesInAccount(graphApi, {
    accountModel,
  });

  return pageModels.map(mapPageModelToGQL);
};

export const pageComments: ResolverFn<
  Promise<UnresolvedCommentGQL[]>,
  {},
  LoggedInGraphQLContext,
  QueryPageCommentsArgs
> = async (_, { entityId }, { dataSources: { graphApi } }) => {
  const pageModel = await PageModel.getPageById(graphApi, {
    entityId,
  });

  const commentModels = await pageModel.getComments(graphApi);

  return commentModels.map(mapCommentModelToGQL);
};
