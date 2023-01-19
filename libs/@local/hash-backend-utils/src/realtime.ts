import { Entity, Link } from "@local/hash-backend-utils/pg-tables";

/**
 * @todo Consider adding realtime handling for types
 *   https://app.asana.com/0/0/1202922776289399/f
 */
export const supportedRealtimeTables = ["entities", "links"] as const;

export type SupportedRealtimeTable = (typeof supportedRealtimeTables)[number];

export const isSupportedRealtimeTable = (
  table: string,
): table is SupportedRealtimeTable =>
  supportedRealtimeTables.includes(table as SupportedRealtimeTable);

export type RealtimeMessage =
  | {
      table: "entities";
      record: Entity;
    }
  | { table: "links"; record: Link };
// | { table: "aggregation_versions"; record: AggregationVersion }
