import { BlockModel } from "../../../../model";

import { QueryKnowledgeBlocksArgs, ResolverFn } from "../../../apiTypes.gen";
import { GraphQLContext } from "../../../context";
import {
  UnresolvedKnowledgeBlockGQL,
  mapBlockModelToGQL,
} from "../model-mapping";

export const knowledgeBlocks: ResolverFn<
  Promise<UnresolvedKnowledgeBlockGQL[]>,
  {},
  GraphQLContext,
  QueryKnowledgeBlocksArgs
> = async (_, params, { dataSources: { graphApi } }) => {
  const blocks = await Promise.all(
    params.blocks.map(({ entityId }) =>
      BlockModel.getBlockById(graphApi, { entityId }),
    ),
  );

  return blocks.map(mapBlockModelToGQL);
};
