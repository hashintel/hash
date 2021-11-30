import jp from "jsonpath";
import { UserInputError } from "apollo-server-errors";
import { get, orderBy } from "lodash";
import { DBClient } from "../db";
import {
  Entity,
  isUnupportedJSONPath,
  JSONPathComponent,
  Link,
  Aggregation,
  User,
} from ".";
import {
  LinkedAggregation as GQLLinkedAggregation,
  AggregateOperation,
} from "../graphql/apiTypes.gen";
import { DBAggregation } from "../db/adapter";

export type GQLLinkedAggregationExternalResolvers = "__typename" | "results";

export type UnresolvedGQLLinkedAggregation = Omit<
  GQLLinkedAggregation,
  GQLLinkedAggregationExternalResolvers
>;

export type CreateAggregationArgs = {
  stringifiedPath: string;
  operation: AggregateOperation;
  source: Entity;
  createdBy: User;
};

export type AggregationConstructorArgs = {
  stringifiedPath: string;

  sourceAccountId: string;
  sourceEntityId: string;
  sourceEntityVersionIds: Set<string>;

  operation: AggregateOperation;

  createdById: string;
  createdAt: Date;
};

const mapDBAggregationToModel = (dbAggregation: DBAggregation) =>
  new Aggregation({
    ...dbAggregation,
    stringifiedPath: dbAggregation.path,
    operation: dbAggregation.operation as AggregateOperation,
  });

class __Aggregation {
  stringifiedPath: string;
  path: jp.PathComponent[];

  sourceAccountId: string;
  sourceEntityId: string;
  sourceEntityVersionIds: Set<string>;

  operation: AggregateOperation;

  createdById: string;
  createdAt: Date;

  constructor({
    stringifiedPath,
    operation,
    sourceAccountId,
    sourceEntityId,
    sourceEntityVersionIds,
    createdAt,
    createdById,
  }: AggregationConstructorArgs) {
    this.stringifiedPath = stringifiedPath;
    this.path = Link.parseStringifiedPath(stringifiedPath);
    this.operation = operation;
    this.sourceAccountId = sourceAccountId;
    this.sourceEntityId = sourceEntityId;
    this.sourceEntityVersionIds = sourceEntityVersionIds;
    this.createdAt = createdAt;
    this.createdById = createdById;
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

          if (typeof item !== "string") return null;

          switch (filterItem.operator) {
            case "CONTAINS":
              return item
                .toLowerCase()
                .includes(filterItem.value.toLowerCase());
            case "DOES_NOT_CONTAIN":
              return !item
                .toLowerCase()
                .includes(filterItem.value.toLowerCase());
            case "STARTS_WITH":
              return item
                .toLowerCase()
                .startsWith(filterItem.value.toLowerCase());
            case "ENDS_WITH":
              return item
                .toLowerCase()
                .endsWith(filterItem.value.toLowerCase());
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

        return (entity) => entity.properties[field];
      }),
      multiSort.map(({ desc }) => (desc ? "desc" : "asc")),
    );
  }

  static async create(
    client: DBClient,
    params: CreateAggregationArgs,
  ): Promise<Aggregation> {
    const { stringifiedPath, source, operation, createdBy } = params;

    Link.validatePath(stringifiedPath);

    /** @todo: check entity type to see if there is an inverse relationship needs to be created */

    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    if (
      await Aggregation.getEntityAggregation(client, {
        source,
        stringifiedPath,
      })
    ) {
      throw new Error("Cannot create aggregation that already exists");
    }

    const dbAggregation = await client.createAggregation({
      path: stringifiedPath,
      sourceAccountId,
      sourceEntityId,
      operation,
      createdById: createdBy.accountId,
    });

    return mapDBAggregationToModel(dbAggregation);
  }

  static async getEntityAggregation(
    client: DBClient,
    params: {
      source: Entity;
      stringifiedPath: string;
    },
  ): Promise<Aggregation | null> {
    const { source, stringifiedPath } = params;
    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    const dbAggregation = await client.getEntityAggregation({
      sourceAccountId,
      sourceEntityId,
      sourceEntityVersionId: source.metadata.versioned
        ? source.entityVersionId
        : undefined,
      path: stringifiedPath,
    });

    return dbAggregation ? mapDBAggregationToModel(dbAggregation) : null;
  }

  static async getAllEntityAggregations(
    client: DBClient,
    params: {
      source: Entity;
    },
  ): Promise<Aggregation[]> {
    const { source } = params;
    const { accountId: sourceAccountId, entityId: sourceEntityId } = source;

    const dbAggregations = await client.getEntityAggregations({
      sourceAccountId,
      sourceEntityId,
      sourceEntityVersionId: source.metadata.versioned
        ? source.entityVersionId
        : undefined,
    });

    return dbAggregations.map(mapDBAggregationToModel);
  }

  async updateOperation(
    client: DBClient,
    params: {
      operation: AggregateOperation;
    },
  ): Promise<Aggregation> {
    const { sourceEntityVersionIds } = await client.updateAggregationOperation({
      sourceAccountId: this.sourceAccountId,
      sourceEntityId: this.sourceEntityId,
      path: this.stringifiedPath,
      operation: params.operation,
    });
    this.operation = params.operation;
    this.sourceEntityVersionIds = sourceEntityVersionIds;

    return this;
  }

  async getResults(client: DBClient): Promise<Entity[]> {
    const {
      entityTypeId,
      entityTypeVersionId,
      multiSort,
      multiFilter,
      pageNumber,
      itemsPerPage,
    } = this.operation;
    /**
     * @todo: this returns an array of all entities of the given type in the account.
     * We should perform the sorting & filtering in the database for better performance.
     * For pagination, using a database cursor may be an option.
     */
    const entities = await Entity.getEntitiesByType(client, {
      accountId: this.sourceAccountId,
      entityTypeId,
      entityTypeVersionId: entityTypeVersionId || undefined,
      latestOnly: true,
    });

    const startIndex = pageNumber === 1 ? 0 : (pageNumber - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, entities.length);

    const filteredEntities = multiFilter
      ? Aggregation.filterEntities(entities, multiFilter)
      : entities;

    const results = (
      multiSort
        ? Aggregation.sortEntities(filteredEntities, multiSort)
        : filteredEntities
    ).slice(startIndex, endIndex);

    /** @todo: filter source entity from results? */

    return results;
  }

  async delete(client: DBClient): Promise<void> {
    await client.deleteAggregation({
      sourceAccountId: this.sourceAccountId,
      sourceEntityId: this.sourceEntityId,
      path: this.stringifiedPath,
    });
  }

  toGQLLinkedAggregation(): UnresolvedGQLLinkedAggregation {
    return {
      path: this.stringifiedPath,
      operation: this.operation,
    };
  }
}

export default __Aggregation;
