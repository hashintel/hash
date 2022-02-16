import { ApolloError } from "apollo-server-errors";
import { Block, UnresolvedGQLBlock, UnresolvedGQLEntity } from "../../../model";
import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const data: Resolver<
  Promise<UnresolvedGQLEntity>,
  UnresolvedGQLBlock,
  GraphQLContext
> = async ({ accountId, entityId }, _, ctx) => {
  const { dataSources } = ctx;

  const block = await Block.getBlockById(dataSources.db, {
    accountId,
    entityId,
  });

  if (!block) {
    throw new ApolloError(
      `Block with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const blockData = await block.getBlockData(dataSources.db);

  return blockData.toGQLUnknownEntity();
};

export const blockLinkedEntities = {
  data,
};
