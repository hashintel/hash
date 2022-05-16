import { ApolloError } from "apollo-server-errors";
import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLUnknownEntity } from "../../../model";
import {
  generateEntityLinkGroupsObject,
  linkHasSameDestinationAs,
} from "./linkGroups";
import { DbUnknownEntity } from "../../../db/adapter";

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

  /**
   * @todo: figure out how the linkGroups object can be accessed without reproducing it
   * (when both the `linkedGroups` and `linkedEntities` field resolvers are called in the
   * same entity GQL query)
   */
  const linkGroupsObject = await generateEntityLinkGroupsObject(
    dataSources.db,
    source,
  );

  const allLinks = Object.values(linkGroupsObject)
    .flatMap((linkPathsByEntityVersion) =>
      Object.values(linkPathsByEntityVersion),
    )
    .map((linksByPath) => Object.values(linksByPath))
    .flat(2);

  const entities = await Promise.all(
    allLinks
      // ensure we only fetch the destination entities for links...
      .filter(
        (link, i, all) =>
          // ...that don't have the source entity as their destination (these are redundant)
          !(link.destinationEntityId === source.entityId) &&
          // ...and that are not duplicates
          all.findIndex(linkHasSameDestinationAs(link)) === i,
      )
      .map((link) => link.getDestination(dataSources.db)),
  );

  return entities.map((linkedEntity) => linkedEntity.toGQLUnknownEntity());
};
