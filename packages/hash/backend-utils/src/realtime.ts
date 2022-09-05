import {
  EntityVersion,
  AggregationVersion,
  LinkVersion,
} from "@hashintel/hash-backend-utils/pgTables";

/**
 * @todo Consider adding realtime handling for types
 *   https://app.asana.com/0/0/1202922776289399/f
 */
export const supportedRealtimeTables = ["entities", "links"] as const;

export type SupportedRealtimeTable = typeof supportedRealtimeTables[number];

export const isSupportedRealtimeTable = (
  table: string,
): table is SupportedRealtimeTable =>
  supportedRealtimeTables.includes(table as SupportedRealtimeTable);

export type RealtimeMessage =
  | {
      table: "entity_versions";
      record: EntityVersion;
    }
  | { table: "aggregation_versions"; record: AggregationVersion }
  | { table: "link_versions"; record: LinkVersion };
