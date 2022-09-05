/**
 * This module contains type definitions for tables in the Postgres database. Column
 * names are converted from snake_case to camelCase for consistency.
 */
import { Wal2JsonMsg } from "./wal2json";

export class Entity {
  constructor(
    /**
     * @todo Update table definition when provenance info is added for updates
     *   https://app.asana.com/0/1202805690238892/1202848989198291/f
     */
    public entityId: string,
    public version: string,
    public entityTypeVersionId: string,
    public properties: Record<string, unknown>,
    public createdBy: string,
  ) {}

  private static parseFromRow(row: Record<string, unknown>): Entity {
    return {
      entityId: row.entity_id as string,
      version: row.version as string,
      entityTypeVersionId: row.entity_type_version_id as string,
      properties:
        typeof row.properties === "string"
          ? JSON.parse(row.properties)
          : row.properties,
      createdBy: row.created_by as string,
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): Entity {
    if (msg.table !== "entities") {
      throw new Error(`invalid table "${msg.table}" for an 'entities' update`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );
    return this.parseFromRow(obj);
  }
}

export class Link {
  constructor(
    /**
     * @todo Update table definition when provenance info is added for updates
     *   https://app.asana.com/0/1202805690238892/1202848989198291/f
     */
    public sourceEntityId: string,
    public targetEntityId: string,
    public linkTypeVersionId: string,
    public createdBy: string,
  ) {}

  private static parseFromRow(row: Record<string, unknown>): Link {
    return {
      sourceEntityId: row.source_entity_id as string,
      targetEntityId: row.target_entity_id as string,
      linkTypeVersionId: row.link_type_version_id as string,
      createdBy: row.created_by as string,
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): Link {
    if (msg.table !== "links") {
      throw new Error(`invalid table "${msg.table}" for a 'link' update`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );
    return this.parseFromRow(obj);
  }
}

/*
export class AggregationVersion {
  constructor(
    public aggregationId: string,
    public aggregationVersionId: string,
    public sourceAccountId: string,
    public sourceEntityId: string,
    public appliedToSourceAt: Date,
    public appliedToSourceByAccountId: string,
    public removedFromSourceAt: Date | undefined,
    public removedFromSourceByAccountId: string | undefined,
    public operation: any,
    public updatedAt: Date,
    public updatedByAccountId: string,
  ) {}

  private static parseFromRow(
    row: Record<string, unknown>,
  ): AggregationVersion {
    return {
      aggregationId: row.aggregation_id as string,
      aggregationVersionId: row.aggregation_version_id as string,
      sourceAccountId: row.source_account_id as string,
      sourceEntityId: row.source_entity_id as string,
      appliedToSourceAt: new Date(row.applied_to_source_at as string),
      appliedToSourceByAccountId: row.applied_to_source_by_account_id as string,
      removedFromSourceAt: row.removed_from_source_at
        ? new Date(row.removed_from_source_at as string)
        : undefined,
      removedFromSourceByAccountId:
        (row.removed_from_source_by_account_id as string | undefined) ??
        undefined,
      operation: row.operation,
      updatedAt: new Date(row.updated_at as string),
      updatedByAccountId: row.updated_by_account_id as string,
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): AggregationVersion {
    if (msg.table !== "aggregation_versions") {
      throw new Error(
        `invalid table "${msg.table}" for AggregationVersion type`,
      );
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );
    return this.parseFromRow(obj);
  }
}
*/
