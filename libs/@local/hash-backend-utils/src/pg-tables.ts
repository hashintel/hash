/**
 * This module contains type definitions for tables in the Postgres database. Column
 * names are converted from snake_case to camelCase for consistency.
 */
import { JsonObject } from "@blockprotocol/core";
import { EditionCreatedById, Uuid } from "@local/hash-subgraph";

import { Wal2JsonMsg } from "./wal2json";

type EntityEditionRecord = {
  archived: boolean;
  entityEditionId: Uuid;
  properties: JsonObject;
  leftToRightOrder?: number;
  rightToLeftOrder?: number;
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
    leftToRightOrder: obj.left_to_right_order as number | undefined,
    rightToLeftOrder: obj.right_to_left_order as number | undefined,
    editionCreatedById: obj.record_created_by_id as
      | EditionCreatedById
      | undefined,
  };
};
