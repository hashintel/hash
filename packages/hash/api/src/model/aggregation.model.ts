/** @todo - Fix/reimplement linkedAggregations - https://app.asana.com/0/1201095311341924/1202938872166821 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { UserInputError } from "apollo-server-errors";
import jp from "jsonpath";
import { get, merge, orderBy } from "lodash";

import {
  AggregateOperation,
  AggregateOperationInput,
  LinkedAggregation as GQLLinkedAggregation,
} from "../graphql/api-types.gen";
import {
  Aggregation,
  Entity,
  isUnupportedJSONPath,
  JSONPathComponent,
  Link,
  User,
} from ".";

export type GQLLinkedAggregationExternalResolvers = "__typename" | "results";

export type UnresolvedGQLAggregateOperation = Omit<
  AggregateOperation,
  "pageCount"
>;

export type UnresolvedGQLLinkedAggregation = Omit<
  GQLLinkedAggregation,
  GQLLinkedAggregationExternalResolvers
>;

export type CreateAggregationArgs = {
  stringifiedPath: string;
  operation: AggregateOperationInput;
  source: Entity;
  createdBy: User;
};

export type AggregationConstructorArgs = {
  aggregationId: string;
  aggregationVersionId: string;

  stringifiedPath: string;

  sourceAccountId: string;
  sourceEntityId: string;

  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;
  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;

  operation: UnresolvedGQLAggregateOperation;

  updatedAt: Date;
  updatedByAccountId: string;
};

const mapDbAggregationToModel = (dbAggregation: DbAggregation) =>
  new Aggregation({
    ...dbAggregation,
    stringifiedPath: dbAggregation.path,
    operation: dbAggregation.operation as UnresolvedGQLAggregateOperation,
  });

class __Aggregation {
  aggregationId: string;
  aggregationVersionId: string;

  stringifiedPath: string;
  path: jp.PathComponent[];

  sourceAccountId: string;
  sourceEntityId: string;

  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;
  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;

  operation: UnresolvedGQLAggregateOperation;

  updatedAt: Date;
  updatedByAccountId: string;

  constructor({
    aggregationId,
    aggregationVersionId,
    stringifiedPath,
    operation,
    sourceAccountId,
    sourceEntityId,
    appliedToSourceAt,
    appliedToSourceByAccountId,
    removedFromSourceAt,
    removedFromSourceByAccountId,
    updatedAt,
    updatedByAccountId,
  }: AggregationConstructorArgs) {
    this.aggregationId = aggregationId;
    this.aggregationVersionId = aggregationVersionId;
    this.stringifiedPath = stringifiedPath;
    this.path = Link.parseStringifiedPath(stringifiedPath);
    this.operation = operation;
    this.sourceAccountId = sourceAccountId;
    this.sourceEntityId = sourceEntityId;
    this.appliedToSourceAt = appliedToSourceAt;
    this.appliedToSourceByAccountId = appliedToSourceByAccountId;
    this.removedFromSourceAt = removedFromSourceAt;
    this.removedFromSourceByAccountId = removedFromSourceByAccountId;
    this.updatedAt = updatedAt;
    this.updatedByAccountId = updatedByAccountId;
  }

  static isPathValid(path: string): boolean {
    try {
      const components = jp.parse(path) as JSONPathComponent[];

      if (isUnupportedJSONPath(components)) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  static parseStringifiedPath(stringifiedPath: string): jp.PathComponent[] {
    const components = jp.parse(stringifiedPath) as JSONPathComponent[];

    if (isUnupportedJSONPath(components)) {
      throw new Error(
        `Cannot parse unsupported JSON path "${stringifiedPath}""`,
      );
    }

    return components.slice(1).map(({ expression }) => expression.value);
  }

  static stringifyPath(path: jp.PathComponent[]) {
    return jp.stringify(path);
  }

  static validatePath(path: string) {
    if (!Link.isPathValid(path)) {
      throw new UserInputError(`"${path}" is not a valid JSON path`);
    }
  }

  static filterEntities(
    data: Entity[],
    multiFilter: NonNullable<AggregateOperation["multiFilter"]>,
  ) {
    return data.filter((entity) => {
      const results = multiFilter.filters
        .map((filterItem) => {
          const item = get(entity.properties, filterItem.field);

          if (typeof item !== "string") {
            return null;
          }

          if (
            [
              "CONTAINS",
              "DOES_NOT_CONTAIN",
              "IS",
              "IS_NOT",
              "ENDS_WITH",
              "STARTS_WITH",
            ].includes(filterItem.operator) &&
            !filterItem.value
          ) {
            throw new Error(
              `You must provide 'value' when using operator '${filterItem.operator}'`,
            );
          }

          switch (filterItem.operator) {
            case "CONTAINS":
              return item
                .toLowerCase()
                .includes(filterItem.value!.toLowerCase());
            case "DOES_NOT_CONTAIN":
              return !item
                .toLowerCase()
                .includes(filterItem.value!.toLowerCase());
            case "STARTS_WITH":
              return item
                .toLowerCase()
                .startsWith(filterItem.value!.toLowerCase());
            case "ENDS_WITH":
              return item
                .toLowerCase()
                .endsWith(filterItem.value!.toLowerCase());
            case "IS_EMPTY":
              return !item;
            case "IS_NOT_EMPTY":
              return !!item;
            case "IS":
              return item.toLowerCase() === filterItem.value!.toLowerCase();
            case "IS_NOT":
              return item.toLowerCase() !== filterItem.value!.toLowerCase();
            default:
              return null;
          }
        })
        .filter((val) => val !== null);

      return multiFilter.operator === "OR"
        ? results.some(Boolean)
        : results.every(Boolean);
    });
  }

  static sortEntities(
    entities: Entity[],
    multiSort: NonNullable<AggregateOperation["multiSort"]>,
  ) {
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

        return (entity) => get(entity.properties, field);
      }),
      multiSort.map(({ desc }) => (desc ? "desc" : "asc")),
    );
  }

  static async create(
    client: DbClient,
    params: CreateAggregationArgs,
  ): Promise<Aggregation> {
    const {
      stringifiedPath,
      source,
      operation: operationInput,
      createdBy,
    } = params;

    const operation: UnresolvedGQLAggregateOperation = {
      ...operationInput,
      itemsPerPage: operationInput.itemsPerPage ?? 10,
      pageNumber: operationInput.pageNumber ?? 1,
    };

    Link.validatePath(stringifiedPath);

    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    if (
      await Aggregation.getEntityAggregationByPath(client, {
        source,
        stringifiedPath,
      })
    ) {
      /** @todo: consider supporting multiple aggregations at the same path */

      throw new Error("Cannot create aggregation that already exists");
    }

    const dbAggregation = await client.createAggregation({
      path: stringifiedPath,
      sourceAccountId,
      sourceEntityId,
      operation,
      createdByAccountId: createdBy.accountId,
    });

    return mapDbAggregationToModel(dbAggregation);
  }

  static async getEntityAggregationByPath(
    client: DbClient,
    params: {
      source: Entity;
      stringifiedPath: string;
    },
  ): Promise<Aggregation | null> {
    const { source, stringifiedPath } = params;
    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    const dbAggregation = await client.getEntityAggregationByPath({
      sourceAccountId,
      sourceEntityId,
      path: stringifiedPath,
    });

    return dbAggregation ? mapDbAggregationToModel(dbAggregation) : null;
  }

  static async getAggregationById(
    client: DbClient,
    params: {
      sourceAccountId: string;
      aggregationId: string;
    },
  ): Promise<Aggregation | null> {
    const dbAggregation = await client.getAggregation(params);

    return dbAggregation ? mapDbAggregationToModel(dbAggregation) : null;
  }

  static async getAllEntityAggregations(
    client: DbClient,
    params: {
      source: Entity;
      activeAt?: Date;
    },
  ): Promise<Aggregation[]> {
    const { source, activeAt } = params;
    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    const dbAggregations = await client.getEntityAggregations({
      sourceAccountId,
      sourceEntityId,
      activeAt,
    });

    return dbAggregations.map(mapDbAggregationToModel);
  }

  async updateOperation(
    client: DbClient,
    params: {
      operation: AggregateOperationInput;
      updatedByAccountId: string;
    },
  ): Promise<Aggregation> {
    const updatedDbAggregation = await client.updateAggregationOperation({
      sourceAccountId: this.sourceAccountId,
      aggregationId: this.aggregationId,
      updatedOperation: {
        ...params.operation,
        itemsPerPage: params.operation.itemsPerPage ?? 10,
        pageNumber: params.operation.pageNumber ?? 1,
      },
      updatedByAccountId: params.updatedByAccountId,
    });

    merge(this, mapDbAggregationToModel(updatedDbAggregation));

    return this;
  }

  async getSourceEntity(client: DbClient): Promise<Entity> {
    const sourceEntity = await Entity.getEntityLatestVersion(client, {
      accountId: this.sourceAccountId,
      entityId: this.sourceEntityId,
    });

    if (!sourceEntity) {
      throw new Error(
        `Critical: source entity of aggregation with aggregationId ${this.aggregationId} not found`,
      );
    }

    return sourceEntity;
  }

  async getResults(
    client: DbClient,
    params?: {
      disablePagination?: boolean;
    },
  ): Promise<Entity[]> {
    const {
      entityTypeId,
      entityTypeVersionId,
      multiSort,
      multiFilter,
      pageNumber,
      itemsPerPage,
    } = this.operation;
    /**
     * @todo: this returns an array of all entities of the given type (if any) in the account.
     * We should perform the sorting & filtering in the database for better performance.
     * For pagination, using a database cursor may be an option.
     */
    const entities = await Entity.getAccountEntities(client, {
      accountId: this.sourceAccountId,
      entityTypeFilter: {
        entityTypeId: entityTypeId ?? undefined,
        entityTypeVersionId: entityTypeVersionId || undefined,
      },
    });

    const filteredEntities = multiFilter
      ? Aggregation.filterEntities(entities, multiFilter)
      : entities;

    const sortedEntities = multiSort
      ? Aggregation.sortEntities(filteredEntities, multiSort)
      : filteredEntities;

    /** @todo: filter source entity from results? */

    const { disablePagination } = params ?? {};

    if (disablePagination) {
      return sortedEntities;
    }

    const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, entities.length);

    return sortedEntities.slice(startIndex, endIndex);
  }

  async getPageCount(client: DbClient): Promise<number> {
    const { itemsPerPage } = this.operation;

    /**
     * @todo: implement more performant way of determining the number of
     * possible results
     */
    const numberOfPossibleResults = (
      await this.getResults(client, {
        disablePagination: true,
      })
    ).length;

    return Math.ceil(numberOfPossibleResults / itemsPerPage);
  }

  async delete(
    client: DbClient,
    params: { deletedByAccountId: string },
  ): Promise<void> {
    const { deletedByAccountId } = params;
    await client.deleteAggregation({
      sourceAccountId: this.sourceAccountId,
      aggregationId: this.aggregationId,
      deletedByAccountId,
    });
  }

  async toGQLLinkedAggregation(
    client: DbClient,
  ): Promise<UnresolvedGQLLinkedAggregation> {
    return {
      aggregationId: this.aggregationId,
      sourceAccountId: this.sourceAccountId,
      sourceEntityId: this.sourceEntityId,
      path: this.stringifiedPath,
      operation: {
        ...this.operation,
        /**
         * @todo: move this into a field resolver so that it is only
         * calculated when the field is requested
         */
        pageCount: await this.getPageCount(client),
      },
    };
  }
}

export default __Aggregation;
