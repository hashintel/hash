import { ApolloError } from "apollo-server-errors";
import { Resolver } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLUnknownEntity } from "../../../model";

export const linkedEntities: Resolver<
  Promise<UnresolvedGQLUnknownEntity[]>,
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, { dataSources }) => {
  const source = await Entity.getEntity(dataSources.db, {
    accountId: entity.accountId,
    entityVersionId: entity.entityVersionId,
  });

  if (!source) {
    const msg = `entity with version ID ${entity.entityVersionId} not found in account ${entity.accountId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const outgoingLinks = await source.getOutgoingLinks(dataSources.db);

  const entities = await Promise.all(
    outgoingLinks
      // remove duplicate linked entities
      .filter(
        (link, i, all) =>
          all.findIndex(
            ({ dstEntityId, dstEntityVersionId }) =>
              dstEntityId === link.dstEntityId &&
              dstEntityVersionId === link.dstEntityVersionId,
          ) === i,
      )
      .map((link) => link.getDestination(dataSources.db)),
  );

  return entities.map((linkedEntity) => linkedEntity.toGQLUnknownEntity());
};
