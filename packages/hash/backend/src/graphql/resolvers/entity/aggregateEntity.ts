import {
  QueryAggregateEntityArgs,
  Resolver,
  AggregateOperation,
  AggregateOperationInput,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { DBAdapter } from "../../../db";

/** makes it possible to access nested paths (e.g person.location.name)
 * @todo properly type this
 */
const resolvePath = (object: any, path: string, defaultValue?: any) =>
  path
    .split(".")
    .reduce((acc, currVal) => acc?.[currVal] ?? defaultValue, object);

/** Compare entities on a given property. */
const compareEntitiesByField = (
  entityA: Entity,
  entityB: Entity,
  propertyPath: string,
  desc: boolean
): number => {
  if (
    propertyPath === "entityCreatedAt" ||
    propertyPath === "entityVersionCreatedAt" ||
    propertyPath === "entityVersionUpdatedAt"
  ) {
    return entityA[propertyPath].getTime() - entityB[propertyPath].getTime();
  }

  const a = desc
    ? resolvePath(entityB.properties, propertyPath)
    : resolvePath(entityA.properties, propertyPath);
  const b = desc
    ? resolvePath(entityA.properties, propertyPath)
    : resolvePath(entityB.properties, propertyPath);

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

export const dbAggregateEntity =
  (db: DBAdapter) =>
  async (params: {
    accountId: string;
    operation?: AggregateOperationInput | null;
    entityTypeId: string;
  }) => {
    const { accountId, operation, entityTypeId } = params;
    const pageNumber = operation?.pageNumber || 1;
    const itemsPerPage = operation?.itemsPerPage || 10;
    const sort = operation?.sort?.field || "updatedAt";
    const desc = operation?.sort?.desc;

    // TODO: this returns an array of all entities of the given type in the account.
    // We should perform the sorting & filtering in the database for better performance.
    // For pagination, using a database cursor may be an option.
    const entities = await Entity.getEntitiesByType(db)({
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

export const aggregateEntity: Resolver<
  Promise<{
    results: EntityWithIncompleteEntityType[];
    operation: AggregateOperation;
  }>,
  {},
  GraphQLContext,
  QueryAggregateEntityArgs
> = async (_, args, { dataSources }) => {
  return dbAggregateEntity(dataSources.db)(args);
};
