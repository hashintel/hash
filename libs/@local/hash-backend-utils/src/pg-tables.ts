/**
 * This module contains type definitions for tables in the Postgres database. Column
 * names are converted from snake_case to camelCase for consistency.
 */
import type { JsonObject } from "@blockprotocol/core";
import type { EditionCreatedById } from "@local/hash-graph-types/account";
import type { Uuid } from "@local/hash-graph-types/branded";

import type { Wal2JsonMsg as Wal2JsonMessage } from "./wal2json.js";

interface EntityEditionRecord {
  archived: boolean;
  entityEditionId: Uuid;
  properties: JsonObject;
  editionCreatedById?: EditionCreatedById; // the UUID of the user who created this edition
}

export const entityEditionTableName = "entity_editions";

export const entityEditionRecordFromRealtimeMessage = (
  message: Wal2JsonMessage,
): EntityEditionRecord => {
  if (message.table !== entityEditionTableName) {
    throw new Error(
      `Invalid table "${message.table}", expected ${entityEditionTableName}`,
    );
  }
  const object = Object.fromEntries(
    message.columns.map(({ name, value }) => [name, value]),
  );

  return {
    archived: object.archived as boolean,
    entityEditionId: object.entity_edition_id as Uuid,
    properties: JSON.parse(object.properties as string) as JsonObject,
    editionCreatedById: object.edition_created_by_id as
      | EditionCreatedById
      | undefined,
  };
};
