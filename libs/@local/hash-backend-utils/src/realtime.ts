/**
 * @todo Consider adding realtime handling for types
 *   https://app.asana.com/0/0/1202922776289399/f
 */
const supportedTables = {
  entityTables: ["entity_editions", "entity_temporal_metadata"],
  entityTypeTables: ["entity_types"],
  propertyTypeTables: ["property_types"],
} as const;

export const supportedRealtimeTables: SupportedRealtimeTable[] =
  Object.values(supportedTables).flat();

export type SupportedRealtimeTable =
  (typeof supportedTables)[keyof typeof supportedTables][number];

export type SupportedRealtimeEntityTable =
  (typeof supportedTables)["entityTables"][number];

export const isSupportedRealtimeEntityTable = (
  table: string,
): table is SupportedRealtimeEntityTable =>
  supportedTables.entityTables.includes(table as SupportedRealtimeEntityTable);

export type SupportedRealtimeEntityTypeTable =
  (typeof supportedTables)["entityTypeTables"][number];

export const isSupportedRealtimeEntityTypeTable = (
  table: string,
): table is SupportedRealtimeEntityTable =>
  supportedTables.entityTypeTables.includes(
    table as SupportedRealtimeEntityTypeTable,
  );

export type SupportedRealtimePropertyTypeTable =
  (typeof supportedTables)["propertyTypeTables"][number];

export const isSupportedRealtimePropertyTypeTable = (
  table: string,
): table is SupportedRealtimePropertyTypeTable =>
  supportedTables.propertyTypeTables.includes(
    table as SupportedRealtimePropertyTypeTable,
  );
