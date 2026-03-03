import {
  getPageById,
  setPageParentPage,
} from "../../../../graph/knowledge/system-types/page";
import type {
  MutationSetParentPageArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import * as Error from "../../../error";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedPageGQL } from "../graphql-mapping";
import { mapPageToGQL } from "../graphql-mapping";

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
    throw Error.badUserInput("A page cannot be the parent of itself");
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
