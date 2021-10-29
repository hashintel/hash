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
    public createdBy: string,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  private static parseFromRow(row: Record<string, unknown>): EntityVersion {
    return {
      accountId: row.account_id as string,
      entityId: row.entity_id as string,
      entityVersionId: row.entity_version_id as string,
      entityTypeVersionId: row.entity_type_version_id as string,
      properties:
        typeof row.properties === "string"
          ? JSON.parse(row.properties as string)
          : row.properties,
      createdBy: row.created_by as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  static parseWal2JsonMsg(msg: Wal2JsonMsg): EntityVersion {
    if (msg.table !== "entity_versions") {
      throw new Error(`invalid table "${msg.table}" for EntityVersion type`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value])
    );
    return EntityVersion.parseFromRow(obj);
  }
}
