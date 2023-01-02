import { getBlockById } from "../../../../graph/knowledge/system-types/block";
import { QueryBlocksArgs, ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { UnresolvedBlockGQL } from "../graphql-mapping";

export const blocksResolver: ResolverFn<
  Promise<UnresolvedBlockGQL[]>,
  {},
  GraphQLContext,
  QueryBlocksArgs
> = async (_, params, { dataSources: { graphApi } }) => {
  const blocks = await Promise.all(
    params.blocks.map((entityId) => getBlockById({ graphApi }, { entityId })),
  );

  return blocks.map(({ componentId, entity }) => ({
    componentId,
    metadata: entity.metadata,
    properties: entity.properties,
  }));
};
