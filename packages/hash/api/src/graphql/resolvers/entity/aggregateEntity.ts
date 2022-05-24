import {
  QueryAggregateEntityArgs,
  Resolver,
  AggregateOperation,
  AggregateOperationInput,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Aggregation, Entity, UnresolvedGQLEntity } from "../../../model";
import { DbAdapter } from "../../../db";

export const dbAggregateEntity =
  (db: DbAdapter) =>
  async (params: { accountId: string; operation: AggregateOperationInput }) => {
    const { accountId, operation } = params;
    const { entityTypeId } = operation;
    const pageNumber = operation?.pageNumber || 1;
    const itemsPerPage = operation?.itemsPerPage || 10;
    const multiSort = operation?.multiSort ?? [{ field: "updatedAt" }];
    const multiFilter = operation?.multiFilter;

    // TODO: this returns an array of all entities matching the type filter (if any) in the account.
    // We should perform the sorting & filtering in the database for better performance.
    // For pagination, using a database cursor may be an option.
    const entities = await Entity.getAccountEntities(db, {
      accountId,
      entityTypeFilter: {
        entityTypeId,
      },
    });

    const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, entities.length);

    const filteredEntities = multiFilter
      ? Aggregation.filterEntities(entities, multiFilter)
      : entities;

    const results = Aggregation.sortEntities(filteredEntities, multiSort)
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
