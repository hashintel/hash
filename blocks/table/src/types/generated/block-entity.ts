/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = TableBlock;

export type BlockEntityOutgoingLinkAndTarget = TableBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * An opaque, untyped JSON object
 */
export type Object = {};

export type TableBlock = Entity<TableBlockProperties>;

export type TableBlockOutgoingLinkAndTarget = never;

export type TableBlockOutgoingLinksByLinkEntityTypeId = {};

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
 * Whether the table header row is hidden.
 */
export type TableHeaderRowIsHiddenPropertyValue = Boolean;

/**
 * A unique identifier for a local column stored on the "Table" block.
 */
export type TableLocalColumnIDPropertyValue = Text;

/**
 * Local column stored on "Table" block.
 */
export type TableLocalColumnPropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-local-column-id/": TableLocalColumnIDPropertyValue;
};

/**
 * An object representing a local row stored on the "Table" block. The keys of this object must be one of the local column IDs.
 *
 * See: https://blockprotocol.org/@hash/types/property-type/table-local-column/
 */
export type TableLocalRowPropertyValue = Object;

/**
 * Whether the table row numbers are hidden.
 */
export type TableRowNumbersAreHiddenPropertyValue = Boolean;

/**
 * Whether the alternating table rows are zebra striped.
 */
export type TableRowsAreStripedPropertyValue = Boolean;

/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = Text;
