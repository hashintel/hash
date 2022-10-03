import { ApolloError } from "apollo-server-express";

import { LoggedInGraphQLContext } from "../../../context";
import {
  MutationSetParentKnowledgePageArgs,
  ResolverFn,
} from "../../../apiTypes.gen";
import {
  mapPageModelToGQL,
  UnresolvedKnowledgePageGQL,
} from "../model-mapping";
import { PageModel } from "../../../../model";

export const setParentKnowledgePage: ResolverFn<
  Promise<UnresolvedKnowledgePageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentKnowledgePageArgs
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

  let newParentPage: PageModel | null = null;

  if (parentPageEntityId) {
    newParentPage = await PageModel.getPageById(graphApi, {
      entityId: parentPageEntityId,
    });

    if (!newParentPage) {
      throw new ApolloError(
        `Could not find parent page entity with entityId = ${parentPageEntityId}`,
        "NOT_FOUND",
      );
    }
  }

  await pageModel.setParentPage(graphApi, {
    parentPage: newParentPage,
    setById: user.entityId,
    prevIndex,
    nextIndex,
  });

  // Refetching the new page model
  return mapPageModelToGQL(
    await PageModel.getPageById(graphApi, {
      entityId: pageEntityId,
    }),
  );
};
