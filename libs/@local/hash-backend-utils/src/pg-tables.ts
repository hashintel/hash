/**
 * This module contains type definitions for some of the tables in the Postgres database used for realtime updates.
 */
import { SupportedRealtimeTable } from "./realtime";
import { Wal2JsonMsg } from "./wal2json";

export type EntityEdition = {
  entity_edition_id: string;
  properties: Record<string, unknown>;
  left_to_right_order: number;
  right_to_left_order: number;
  record_created_by_id: string;
  archived: boolean;
};

export const entityEditionFromWalJsonMsg = (
  msg: Wal2JsonMsg<SupportedRealtimeTable>,
): EntityEdition => {
  if (msg.table !== "entity_editions") {
    throw new Error(
      `invalid table "${msg.table}" for 'entity_edition' parsing`,
    );
  }
  const obj = Object.fromEntries(
    msg.columns.map(({ name, value }) => [name, value]),
  );

  return {
    entity_edition_id: obj.entity_edition_id as string,
    properties: obj.properties as Record<string, unknown>,
    left_to_right_order: obj.left_to_right_order as number,
    right_to_left_order: obj.right_to_left_order as number,
    record_created_by_id: obj.record_created_by_id as string,
    archived: obj.archived as boolean,
  };
};

export type EntityTemporalMetadata = {
  owned_by_id: string;
  entity_uuid: Record<string, unknown>;
  entity_edition_id: string;
  decision_time: string;
  transaction_time: string;
};

export const entityTemporalMetadataFromWalJsonMsg = (
  msg: Wal2JsonMsg<SupportedRealtimeTable>,
): EntityTemporalMetadata => {
  if (msg.table !== "entity_temporal_metadata") {
    throw new Error(
      `invalid table "${msg.table}" for 'entity_temporal_metadata' parsing`,
    );
  }
  const obj = Object.fromEntries(
    msg.columns.map(({ name, value }) => [name, value]),
  );

  return {
    owned_by_id: obj.owned_by_id as string,
    entity_uuid: obj.entity_uuid as Record<string, unknown>,
    entity_edition_id: obj.entity_edition_id as string,
    decision_time: obj.decision_time as string,
    transaction_time: obj.transaction_time as string,
  };
};

export type Entity = EntityEdition & EntityTemporalMetadata;

export const entityFromWalJsonMsg = (
  entityEdition: Wal2JsonMsg<SupportedRealtimeTable>,
  entityTemporalMetadata: Wal2JsonMsg<SupportedRealtimeTable>,
): Entity => ({
  ...entityEditionFromWalJsonMsg(entityEdition),
  ...entityTemporalMetadataFromWalJsonMsg(entityTemporalMetadata),
});

type OntologyType = {
  ontology_id: string;
  schema: Record<string, unknown>;
};

const ontologyTypeFromWalJsonMsg =
  (table: SupportedRealtimeTable) =>
  (msg: Wal2JsonMsg<SupportedRealtimeTable>): OntologyType => {
    if (msg.table !== table) {
      throw new Error(`invalid table "${msg.table}" for '${table}' parsing`);
    }
    const obj = Object.fromEntries(
      msg.columns.map(({ name, value }) => [name, value]),
    );

    return {
      ontology_id: obj.ontology_id as string,
      schema: obj.schema as Record<string, unknown>,
    };
  };

export type EntityType = OntologyType;
export const entityTypeFromWalJsonMsg: (
  msg: Wal2JsonMsg<SupportedRealtimeTable>,
) => EntityType = ontologyTypeFromWalJsonMsg("entity_types");

export type PropertyType = OntologyType;
export const propertyTypeFromWalJsonMsg: (
  msg: Wal2JsonMsg<SupportedRealtimeTable>,
) => PropertyType = ontologyTypeFromWalJsonMsg("property_types");
