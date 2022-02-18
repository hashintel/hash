import { ApolloError } from "apollo-server-express";
import {
  Block,
  UnresolvedGQLBlock,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import {
  BlockProperties as GQLBlockProperties,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

/**
 * IMPORTANT NOTE: this is a temporary field resolver and will be deprecated
 * once API consumers have been refactored to stop accessing `properties.entity`,
 * `properties.entityId` and `properties.accountId` of a Block, and access these
 * using the `linkGroups` or `entity` fields instead.
 *
 * @deprecated
 */
export const blockProperties: Resolver<
  Promise<
    Omit<GQLBlockProperties, "entity"> & { entity: UnresolvedGQLUnknownEntity }
  >,
  UnresolvedGQLBlock,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const { db } = dataSources;

  const block = await Block.getBlockById(db, {
    accountId,
    entityId,
  });

  if (!block) {
    throw new ApolloError(
      `Block with entityId ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const blockData = await block.getBlockData(db);

  return {
    ...block.properties,
    // Legacy fields of `block.properties`
    entityId: blockData.entityId,
    accountId: blockData.accountId,
    entity: blockData.toGQLUnknownEntity(),
  };
};
