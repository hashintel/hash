import { orderBy, get } from "lodash";
import {
  QueryAggregateEntityArgs,
  Resolver,
  AggregateOperation,
  AggregateOperationInput,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { DBAdapter } from "../../../db";

const sortEntities = (
  entities: Entity[],
  multiSort: NonNullable<AggregateOperation["multiSort"]>,
) => {
  return orderBy(
    entities,
    multiSort.map(({ field }) => {
      if (
        [
          "entityCreatedAt",
          "entityVersionCreatedAt",
          "entityVersionUpdatedAt",
        ].includes(field)
      ) {
        return field;
      }

      return (entity) => entity.properties[field];
    }),
    multiSort.map(({ desc }) => (desc ? "desc" : "asc")),
  );
};

const filterEntities = (
  data: Entity[],
  multiFilter: AggregateOperationInput["multiFilter"],
) => {
  if (!multiFilter) return data;

  return data.filter((entity) => {
    const results = multiFilter.filters
      .map((filterItem) => {
        const item = get(entity.properties, filterItem.field);

        if (typeof item !== "string") return null;

        switch (filterItem.operator) {
          case "CONTAINS":
            return item.toLowerCase().includes(filterItem.value.toLowerCase());
          case "DOES_NOT_CONTAIN":
            return !item.toLowerCase().includes(filterItem.value.toLowerCase());
          case "STARTS_WITH":
            return item
              .toLowerCase()
              .startsWith(filterItem.value.toLowerCase());
          case "ENDS_WITH":
            return item.toLowerCase().endsWith(filterItem.value.toLowerCase());
          case "IS_EMPTY":
            return !item;
          case "IS_NOT_EMPTY":
            return !!item;
          case "IS":
            return item.toLowerCase() === filterItem.value.toLowerCase();
          case "IS_NOT":
            return item.toLowerCase() !== filterItem.value.toLowerCase();
          default:
            return null;
        }
      })
      .filter((val) => val !== null);

    return multiFilter.operator === "OR"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
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
    const multiSort = operation?.multiSort ?? [{ field: "updatedAt" }];
    const multiFilter = operation?.multiFilter;

    // TODO: this returns an array of all entities of the given type in the account.
    // We should perform the sorting & filtering in the database for better performance.
    // For pagination, using a database cursor may be an option.
    const entities = await Entity.getEntitiesByType(db, {
      accountId,
      entityTypeId,
      latestOnly: true,
    });

    const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, entities.length);

    const filteredEntities = filterEntities(entities, multiFilter);

    const results = sortEntities(filteredEntities, multiSort)
      .slice(startIndex, endIndex)
      .map((entity) => entity.toGQLUnknownEntity());

    return {
      results,
      operation: {
        entityTypeId,
        multiSort,
        pageNumber,
        itemsPerPage,
        pageCount: Math.ceil(entities.length / itemsPerPage),
      },
    };
  };

export const aggregateEntity: Resolver<
  Promise<{
    results: UnresolvedGQLEntity[];
    operation: AggregateOperation;
  }>,
  {},
  GraphQLContext,
  QueryAggregateEntityArgs
> = async (_, args, { dataSources }) => {
  return dbAggregateEntity(dataSources.db)(args);
};
