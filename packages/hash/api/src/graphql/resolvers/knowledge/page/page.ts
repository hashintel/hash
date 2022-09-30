import { PageModel } from "../../../../model";

import { QueryKnowledgePageArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
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
