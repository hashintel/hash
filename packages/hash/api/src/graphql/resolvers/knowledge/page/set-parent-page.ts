import { ApolloError } from "apollo-server-express";

import { LoggedInGraphQLContext } from "../../../context";
import { MutationSetParentPageArgs, ResolverFn } from "../../../api-types.gen";
import { mapPageToGQL, UnresolvedPageGQL } from "../graphql-mapping";
import {
  getPageById,
  setPageParentPage,
} from "../../../../graph/knowledge/system-types/page";

export const setParentPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (
  _,
  { pageEntityId, parentPageEntityId, prevIndex = null, nextIndex = null },
  { dataSources: { graphApi }, user },
) => {
  if (pageEntityId === parentPageEntityId) {
    throw new ApolloError("A page cannot be the parent of itself");
  }

  const page = await getPageById(
    { graphApi },
    {
      entityId: pageEntityId,
    },
  );

  const newParentPage = parentPageEntityId
    ? await getPageById(
        { graphApi },
        {
          entityId: parentPageEntityId,
        },
      )
    : null;

  const updatedPage = await setPageParentPage(
    { graphApi },
    {
      page,
      parentPage: newParentPage,
      actorId: user.accountId,
      prevIndex,
      nextIndex,
    },
  );

  return mapPageToGQL(updatedPage);
};
