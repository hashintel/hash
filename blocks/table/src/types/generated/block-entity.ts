/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = TableBlock;

export type BlockEntityOutgoingLinkAndTarget = TableBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * An arbitrary ID
 */
export type IDPropertyValue = Text;

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

export type LinkedQuery = Entity<LinkedQueryProperties> & {
  linkData: LinkData;
};

export type LinkedQueryOutgoingLinkAndTarget = never;

export type LinkedQueryOutgoingLinksByLinkEntityTypeId = {};

/**
 * 123
 */
export type LinkedQueryProperties = LinkedQueryProperties1 &
  LinkedQueryProperties2;
export type LinkedQueryProperties1 = LinkProperties;

export type LinkedQueryProperties2 = {};

/**
 * An opaque, untyped JSON object
 */
export type Object = {};

export type Query = Entity<QueryProperties>;

/**
 * 12312
 */
export type QueryObjectPropertyValue = Object;

export type QueryOutgoingLinkAndTarget = never;

export type QueryOutgoingLinksByLinkEntityTypeId = {};

export type QueryProperties = {
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/query-object/"?: QueryObjectPropertyValue;
};

export type TableBlock = Entity<TableBlockProperties>;

export type TableBlockLinkedQueryLink = {
  linkEntity: LinkedQuery;
  rightEntity: Query;
};

export type TableBlockOutgoingLinkAndTarget = TableBlockLinkedQueryLink;

export type TableBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/entity-type/linked-query/v/1": TableBlockLinkedQueryLink;
};

export type TableBlockProperties = {
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-header-row-is-hidden/"?: TableHeaderRowIsHiddenPropertyValue;
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-row-numbers-are-hidden/"?: TableRowNumbersAreHiddenPropertyValue;
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-rows-are-striped/"?: TableRowsAreStripedPropertyValue;
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  /**
   * @minItems 0
   */
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-column/"?: TableLocalColumnPropertyValue[];
  /**
   * @minItems 0
   */
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-row/"?: TableLocalRowPropertyValue[];
};

/**
 * 123
 */
export type TableHeaderRowIsHiddenPropertyValue = Boolean;

/**
 * Local column stored on "Table" block
 */
export type TableLocalColumnPropertyValue = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/": IDPropertyValue;
};

/**
 * Local row stored on "Table" block
 */
export type TableLocalRowPropertyValue = Object;

/**
 * 123
 */
export type TableRowNumbersAreHiddenPropertyValue = Boolean;

/**
 * 123
 */
export type TableRowsAreStripedPropertyValue = Boolean;

/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * The title of something
 */
export type TitlePropertyValue = Text;
