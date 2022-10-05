import { BlockModel } from "../../../../model";

import { QueryKnowledgeBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedKnowledgeBlockGQL,
  UnresolvedKnowledgeEntityGQL,
  mapEntityModelToGQL,
} from "../model-mapping";

export const dataEntity: ResolverFn<
  Promise<UnresolvedKnowledgeEntityGQL>,
  UnresolvedKnowledgeBlockGQL,
  GraphQLContext,
  QueryKnowledgeBlocksArgs
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const blockModel = await BlockModel.getBlockById(graphApi, {
    entityId,
  });

  return mapEntityModelToGQL(await blockModel.getBlockData(graphApi));
};
