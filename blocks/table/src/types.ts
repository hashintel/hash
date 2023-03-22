import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/table-block/v/3 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * Whether the alternating table rows are zebra striped.
 */
export type TableRowsAreStripedPropertyValue = BooleanDataValue;
/**
 * A True or False value
 */
export type BooleanDataValue = boolean;
/**
 * Whether the table row numbers are hidden.
 */
export type TableRowNumbersAreHiddenPropertyValue = BooleanDataValue;
/**
 * Whether the table header row is hidden.
 */
export type TableHeaderRowIsHiddenPropertyValue = BooleanDataValue;
/**
 * Local column stored on "Table" block.
 */
export type TableLocalColumnPropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-local-column-id/": TableLocalColumnIDPropertyValue;
};
/**
 * A unique identifier for a local column stored on the "Table" block.
 */
export type TableLocalColumnIDPropertyValue = TextDataValue;
/**
 * An object representing a local row stored on the "Table" block. The keys of this object must be one of the local column IDs.
 *
 * See: https://blockprotocol.org/@hash/types/property-type/table-local-column/
 */
export type TableLocalRowPropertyValue = ObjectDataValue;

/**
 * The block entity of the "Table" block.
 *
 * See: https://blockprotocol.org/@hash/blocks/table
 */
export type TableBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-rows-are-striped/"?: TableRowsAreStripedPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-row-numbers-are-hidden/"?: TableRowNumbersAreHiddenPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-header-row-is-hidden/"?: TableHeaderRowIsHiddenPropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/table-local-column/"?: TableLocalColumnPropertyValue[];
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/table-local-row/"?: TableLocalRowPropertyValue[];
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
