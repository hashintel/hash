import { ApolloError } from "apollo-server-express";

import { LoggedInGraphQLContext } from "./embed/context";
import {
  MutationSetParentPageArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import {
  mapPageModelToGQL,
  UnresolvedPageGQL,
} from "./page/update-page-contents/model-mapping";
import { PageModel } from "../../auth/model";

export const setParentPage: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (
  _,
  { pageEntityId, parentPageEntityId, prevIndex = null, nextIndex = null },
  { dataSources: { graphApi }, userModel },
) => {
  if (pageEntityId === parentPageEntityId) {
    throw new ApolloError("A page cannot be the parent of itself");
  }

  const pageModel = await PageModel.getPageById(graphApi, {
    entityId: pageEntityId,
  });

  const newParentPageModel = parentPageEntityId
    ? await PageModel.getPageById(graphApi, {
        entityId: parentPageEntityId,
      })
    : null;

  const updatedPageModel = await pageModel.setParentPage(graphApi, {
    parentPageModel: newParentPageModel,
    actorId: userModel.getEntityUuid(),
    prevIndex,
    nextIndex,
  });

  return mapPageModelToGQL(updatedPageModel);
};
