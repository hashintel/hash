import { Entity } from "@local/hash-backend-utils/pg-tables";

/**
 * @todo Consider adding realtime handling for types
 *   https://app.asana.com/0/0/1202922776289399/f
 */
export const supportedRealtimeTables = {
  entityTables: ["entity_editions", "entity_temporal_metadata"],
} as const;

export type SupportedRealtimeTable =
  (typeof supportedRealtimeTables)[keyof typeof supportedRealtimeTables][number];

export type SupportedRealtimeEntityTable =
  (typeof supportedRealtimeTables)["entityTables"][number];

export const isSupportedRealtimeEntityTable = (
  table: string,
): table is SupportedRealtimeEntityTable =>
  supportedRealtimeTables.entityTables.includes(
    table as SupportedRealtimeEntityTable,
  );

export type RealtimeMessage = {
  table: "entities";
  record: Entity;
};
// | { table: "links"; record: Link };
// | { table: "aggregation_versions"; record: AggregationVersion }
