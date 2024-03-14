import { getBlockById } from "../../../../graph/knowledge/system-types/block";
import type { QueryBlocksArgs, ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import type { UnresolvedBlockGQL } from "../graphql-mapping";

export const blocksResolver: ResolverFn<
  Promise<UnresolvedBlockGQL[]>,
  Record<string, never>,
  GraphQLContext,
  QueryBlocksArgs
> = async (_, params, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const blocks = await Promise.all(
    params.blocks.map((entityId) =>
      getBlockById(context, authentication, { entityId }),
    ),
  );

  return blocks.map(({ componentId, entity }) => ({
    componentId,
    metadata: entity.metadata,
    properties: entity.properties,
  }));
};
