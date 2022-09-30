import { EntityModel } from "../../../../model";
import { QueryKnowledgeEntityArgs, ResolverFn } from "../../../apiTypes.gen";
import {
  mapEntityModelToGQL,
  UnresolvedKnowledgeEntityGQL,
} from "../model-mapping";
import { LoggedInGraphQLContext } from "../../../context";

export const knowledgeEntity: ResolverFn<
  Promise<UnresolvedKnowledgeEntityGQL>,
  {},
  LoggedInGraphQLContext,
  QueryKnowledgeEntityArgs
> = async (_, { entityId, entityVersion }, { dataSources: { graphApi } }) => {
  const entity = entityVersion
    ? await EntityModel.getVersion(graphApi, { entityId, entityVersion })
    : await EntityModel.getLatest(graphApi, { entityId });

  return mapEntityModelToGQL(entity);
};
