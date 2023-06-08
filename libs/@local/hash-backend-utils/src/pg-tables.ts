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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
