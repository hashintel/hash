import { ApolloError } from "apollo-server-express";

import {
  getPageById,
  setPageParentPage,
} from "../../../../graph/knowledge/system-types/page.js";
import type {
  MutationSetParentPageArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import type { UnresolvedPageGQL } from "../graphql-mapping.js";
import { mapPageToGQL } from "../graphql-mapping.js";

export const setParentPageResolver: ResolverFn<
  Promise<UnresolvedPageGQL>,
  Record<string, never>,
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
  graphQLContext,
) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

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
