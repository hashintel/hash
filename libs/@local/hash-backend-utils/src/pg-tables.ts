/**
 * This module contains type definitions for tables in the Postgres database. Column
 * names are converted from snake_case to camelCase for consistency.
 */
import type { JsonObject } from "@blockprotocol/core";
import type { EditionCreatedById, Uuid } from "@local/hash-subgraph";

import type { Wal2JsonMsg } from "./wal2json";

type EntityEditionRecord = {
  archived: boolean;
  entityEditionId: Uuid;
  properties: JsonObject;
  editionCreatedById?: EditionCreatedById; // the UUID of the user who created this edition
};

export const entityEditionTableName = "entity_editions";

export const entityEditionRecordFromRealtimeMessage = (
  message: Wal2JsonMsg,
): EntityEditionRecord => {
  if (message.table !== entityEditionTableName) {
    throw new Error(
      `Invalid table "${message.table}", expected ${entityEditionTableName}`,
    );
  }
  const obj = Object.fromEntries(
    message.columns.map(({ name, value }) => [name, value]),
  );

  return {
    archived: obj.archived as boolean,
    entityEditionId: obj.entity_edition_id as Uuid,
    properties: JSON.parse(obj.properties as string) as JsonObject,
    editionCreatedById: obj.edition_created_by_id as
      | EditionCreatedById
      | undefined,
  };
};
