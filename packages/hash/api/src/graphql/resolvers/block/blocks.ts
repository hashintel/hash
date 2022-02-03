import { UnresolvedGQLEntity } from "../../../model";

import { QueryBlocksArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { getBlocks } from "../pages/contents";

export const blocks: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryBlocksArgs
> = async (_, args, ctx) => {
  const { dataSources } = ctx;

  return args.blocks ? await getBlocks(dataSources.db, args.blocks) : [];
};
