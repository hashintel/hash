import {
  EntityVersion,
  AggregationVersion,
  LinkVersion,
} from "@hashintel/hash-backend-utils/pgTables";

export const supportedRealtimeTables = [
  "entity_versions",
  "aggregation_versions",
  "link_versions",
] as const;

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
