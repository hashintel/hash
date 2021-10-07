import {
  QueryAggregateEntityArgs,
  Resolver,
  AggregateOperation,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

/** Compare entities on a given property. */
const compareEntitiesByField = (
  entityA: Entity,
  entityB: Entity,
  property: string,
  desc: boolean
): number => {
  if (
    property === "entityCreatedAt" ||
    property === "entityVersionCreatedAt" ||
    property === "entityVersionUpdatedAt"
  ) {
    return entityA[property].getTime() - entityB[property].getTime();
  }

  const a = desc ? entityB.properties[property] : entityA.properties[property];
  const b = desc ? entityA.properties[property] : entityB.properties[property];

  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b);
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    // Treat true as 1 and false as 0 as JS does
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  return (typeof a).localeCompare(typeof b);
};

export const aggregateEntity: Resolver<
  Promise<{
    results: EntityWithIncompleteEntityType[];
    operation: AggregateOperation;
  }>,
  {},
  GraphQLContext,
  QueryAggregateEntityArgs
> = async (_, { accountId, operation, entityTypeId }, { dataSources }) => {
  const pageNumber = operation?.pageNumber || 1;
  const itemsPerPage = operation?.itemsPerPage || 10;
  const sort = operation?.sort?.field || "updatedAt";
  const desc = operation?.sort?.desc;

  // TODO: this returns an array of all entities of the given type in the account.
  // We should perform the sorting & filtering in the database for better performance.
  // For pagination, using a database cursor may be an option.
  const entities = await Entity.getEntitiesByType(dataSources.db)({
    accountId,
    entityTypeId,
    latestOnly: true,
  });

  const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, entities.length);

  const results = entities
    .sort((a, b) => compareEntitiesByField(a, b, sort, desc ?? false))
    .slice(startIndex, endIndex)
    .map((entity) => entity.toGQLUnknownEntity());

  return {
    results,
    operation: {
      sort,
      pageNumber,
      itemsPerPage,
      pageCount: Math.ceil(entities.length / itemsPerPage),
    },
  };
};
