import { ApolloError } from "apollo-server-express";

import {
  getPageById,
  setPageParentPage,
} from "../../../../graph/knowledge/system-types/page";
import type {
  MutationSetParentPageArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import type { UnresolvedPageGQL } from "../graphql-mapping";
import { mapPageToGQL } from "../graphql-mapping";

export const setParentPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  {},
  LoggedInGraphQLContext,
  MutationSetParentPageArgs
> = async (
  _,
  {
    pageEntityId,
    parentPageEntityId,
    prevFractionalIndex = null,
    nextIndex = null,
  },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  if (pageEntityId === parentPageEntityId) {
    throw new ApolloError("A page cannot be the parent of itself");
  }

  const page = await getPageById(context, authentication, {
    entityId: pageEntityId,
  });

  const newParentPage = parentPageEntityId
    ? await getPageById(context, authentication, {
        entityId: parentPageEntityId,
      })
    : null;

  const updatedPage = await setPageParentPage(context, authentication, {
    page,
    parentPage: newParentPage,
    prevFractionalIndex,
    nextIndex,
  });

  return mapPageToGQL(updatedPage);
};
