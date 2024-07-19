/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = TableBlock;

export type BlockEntityOutgoingLinkAndTarget = TableBlockOutgoingLinkAndTarget;

/**
 * A True or False value.
 */
export type BooleanDataType = boolean;

export type HasQuery = Entity<HasQueryProperties> & { linkData: LinkData };

export type HasQueryOutgoingLinkAndTarget = never;

export interface HasQueryOutgoingLinksByLinkEntityTypeId {}

/**
 * The query that something has.
 */
export type HasQueryProperties = HasQueryProperties1 & HasQueryProperties2;
export type HasQueryProperties1 = LinkProperties;

export interface HasQueryProperties2 {}

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId {}

export interface LinkProperties {}

/**
 * An opaque, untyped JSON object.
 */
export interface ObjectDataType {}

export type Query = Entity<QueryProperties>;

export type QueryOutgoingLinkAndTarget = never;

export interface QueryOutgoingLinksByLinkEntityTypeId {}

export interface QueryProperties {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValue;
}

/**
 * The query for something.
 */
export type QueryPropertyValue = ObjectDataType;

export type TableBlock = Entity<TableBlockProperties>;

export interface TableBlockHasQueryLink {
  linkEntity: HasQuery;
  rightEntity: Query;
}

export type TableBlockOutgoingLinkAndTarget = TableBlockHasQueryLink;

export interface TableBlockOutgoingLinksByLinkEntityTypeId {
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1": TableBlockHasQueryLink;
}

/**
 * The block entity of the "Table" block.
 *
 * See: https://blockprotocol.org/@hash/blocks/table.
 */
export interface TableBlockProperties {
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
}

/**
 * Whether the table header row is hidden.
 */
export type TableHeaderRowIsHiddenPropertyValue = BooleanDataType;

/**
 * A unique identifier for a local column stored on the "Table" block.
 */
export type TableLocalColumnIDPropertyValue = TextDataType;

/**
 * Local column stored on "Table" block.
 */
export interface TableLocalColumnPropertyValue {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-local-column-id/": TableLocalColumnIDPropertyValue;
}

/**
 * An object representing a local row stored on the "Table" block. The keys of this object must be one of the local column IDs.
 *
 * See: https://blockprotocol.org/@hash/types/property-type/table-local-column/.
 */
export type TableLocalRowPropertyValue = ObjectDataType;

/**
 * Whether the table row numbers are hidden.
 */
export type TableRowNumbersAreHiddenPropertyValue = BooleanDataType;

/**
 * Whether the alternating table rows are zebra striped.
 */
export type TableRowsAreStripedPropertyValue = BooleanDataType;

/**
 * An ordered sequence of characters.
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
