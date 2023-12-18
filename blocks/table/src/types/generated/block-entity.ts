/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = Table;

export type BlockEntityOutgoingLinkAndTarget = TableOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

export type HasQuery = Entity<HasQueryProperties> & { linkData: LinkData };

export type HasQueryOutgoingLinkAndTarget = never;

export type HasQueryOutgoingLinksByLinkEntityTypeId = {};

/**
 * The query that something has.
 */
export type HasQueryProperties = HasQueryProperties1 & HasQueryProperties2;
export type HasQueryProperties1 = LinkProperties;

export type HasQueryProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * An opaque, untyped JSON object
 */
export type Object = {};

export type Table = Entity<TableProperties>;

export type TableHasQueryLink = { linkEntity: HasQuery; rightEntity: Entity };

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

export type TableOutgoingLinkAndTarget = TableHasQueryLink;

export type TableOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1": TableHasQueryLink;
};

export type TableProperties = {
  "https://blockprotocol.org/@hash/types/property-type/table-header-row-is-hidden/"?: TableHeaderRowIsHiddenPropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/table-local-column/"?: TableLocalColumnPropertyValue[];
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/table-local-row/"?: TableLocalRowPropertyValue[];
  "https://blockprotocol.org/@hash/types/property-type/table-row-numbers-are-hidden/"?: TableRowNumbersAreHiddenPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/table-rows-are-striped/"?: TableRowsAreStripedPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
};

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
