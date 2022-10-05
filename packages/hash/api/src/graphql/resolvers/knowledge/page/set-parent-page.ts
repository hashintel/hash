import { ApolloError } from "apollo-server-express";

import { LoggedInGraphQLContext } from "../../../context";
import {
  MutationSetParentPersistedPageArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import {
  mapPageModelToGQL,
  UnresolvedPersistedPageGQL,
} from "../model-mapping";
import { PageModel } from "../../../../model";

export const setParentPersistedPage: ResolverFn<
  Promise<UnresolvedPersistedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPersistedPageArgs
> = async (
  _,
  { pageEntityId, parentPageEntityId, prevIndex = null, nextIndex = null },
  { dataSources: { graphApi }, user },
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
    setById: user.entityId,
    prevIndex,
    nextIndex,
  });

  return mapPageModelToGQL(updatedPageModel);
};
