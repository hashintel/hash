import { ApolloError } from "apollo-server-express";
import { MutationTransferEntityArgs, Resolver } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const transferEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationTransferEntityArgs
> = async (
  _,
  { originalAccountId, entityId, newAccountId },
  { dataSources },
) => {
  const entity = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId: originalAccountId,
    entityId,
  });
  if (!entity) {
    throw new ApolloError(
      `Entity ${entityId} doesn't exist in account ${originalAccountId}`,
      "NOT_FOUND",
    );
  }
  await entity.transferEntity(dataSources.db, newAccountId);
  return entity.toGQLUnknownEntity();
};
