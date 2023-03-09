import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/entity-type/table-block/v/4 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Whether the header row is hidden
 */
export type HideHeaderRowPropertyValue = BooleanDataValue;
/**
 * A True or False value
 */
export type BooleanDataValue = boolean;
/**
 * Whether the row numbers are hidden
 */
export type HideRowNumbersPropertyValue = BooleanDataValue;
/**
 * Whether the alternating rows are zebra striped
 */
export type IsStripedPropertyValue = BooleanDataValue;
/**
 * The title of something
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * 123
 */
export type TableLocalRowPropertyValue = ObjectDataValue;
/**
 * 123
 */
export type TableLocalColumnPropertyValue = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/": IDPropertyValue;
};
/**
 * An arbitrary ID
 */
export type IDPropertyValue = TextDataValue;

/**
 * The block entity of the “Table” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/table
 */
export type TableBlockProperties = {
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-header-row/"?: HideHeaderRowPropertyValue;
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-row-numbers/"?: HideRowNumbersPropertyValue;
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/is-striped/"?: IsStripedPropertyValue;
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-row/"?: TableLocalRowPropertyValue[];
  /**
   * @minItems 0
   */
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-column/"?: TableLocalColumnPropertyValue[];
};
/**
 * An opaque, untyped JSON object
 */
export type ObjectDataValue = JsonObject;

export type TableBlock = Entity<TableBlockProperties>;
export type TableBlockLinksByLinkTypeId = {};

export type TableBlockLinkAndRightEntities = NonNullable<
  TableBlockLinksByLinkTypeId[keyof TableBlockLinksByLinkTypeId]
>;

export type RootEntity = TableBlock;
export type RootEntityLinkedEntities = TableBlockLinkAndRightEntities;
export type RootLinkMap = TableBlockLinksByLinkTypeId;
