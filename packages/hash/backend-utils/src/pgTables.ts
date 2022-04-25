/**
 * This module contains type definitions for tables in the Postgres database. Column
 * names are converted from snake_case to camelCase for consistency.
 */
import { Wal2JsonMsg } from "./wal2json";

export class EntityVersion {
  constructor(
    public accountId: string,
    public entityId: string,
    public entityVersionId: string,
    public entityTypeVersionId: string,
    public properties: any,
    public updatedByAccountId: string,
    public updatedAt: Date,
  ) {}

  private static parseFromRow(row: Record<string, unknown>): EntityVersion {
    return {
      accountId: row.account_id as string,
      entityId: row.entity_id as string,
      entityVersionId: row.entity_version_id as string,
      entityTypeVersionId: row.entity_type_version_id as string,
      properties:
        typeof row.properties === "string"
          ? JSON.parse(row.properties)
          : row.properties,
      updatedByAccountId: row.updated_by_account_id as string,
      updatedAt: new Date(row.updated_at as string),
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): EntityVersion {
    if (msg.table !== "entity_versions") {
      throw new Error(`invalid table "${msg.table}" for EntityVersion type`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );
    return this.parseFromRow(obj);
  }
}

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

export class LinkVersion {
  constructor(
    public linkId: string,
    public linkVersionId: string,
    public index: number | undefined,
    public sourceAccountId: string,
    public sourceEntityId: string,
    public appliedToSourceAt: Date,
    public appliedToSourceByAccountId: string,
    public removedFromSourceAt: Date | undefined,
    public removedFromSourceByAccountId: string | undefined,
    public destinationAccountId: string,
    public destinationEntityId: string,
    public destinationEntityVersionId: string | undefined,
    public updatedAt: Date,
    public updatedByAccountId: string,
  ) {}

  private static parseFromRow(row: Record<string, unknown>): LinkVersion {
    return {
      linkId: row.link_id as string,
      linkVersionId: row.link_version_id as string,
      index: row.index === null ? undefined : (row.index as number),
      sourceAccountId: row.source_account_id as string,
      sourceEntityId: row.source_entity_id as string,
      appliedToSourceAt: new Date(row.applied_to_source_at as string),
      appliedToSourceByAccountId: row.applied_to_source_by_account_id as string,
      removedFromSourceAt: row.removed_from_source_at
        ? new Date(row.removed_from_source_at as string)
        : undefined,
      removedFromSourceByAccountId:
        (row.removed_from_source_by_account_id as string) ?? undefined,
      destinationAccountId: row.destination_account_id as string,
      destinationEntityId: row.destination_entity_id as string,
      destinationEntityVersionId:
        (row.destination_entity_version_id as string | undefined) ?? undefined,
      updatedAt: new Date(row.updated_at as string),
      updatedByAccountId: row.updated_by_account_id as string,
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): LinkVersion {
    if (msg.table !== "link_versions") {
      throw new Error(`invalid table "${msg.table}" for LinkVersion type`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );
    return this.parseFromRow(obj);
  }
}
