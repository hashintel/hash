/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = ChartBlock;

export type BlockEntityOutgoingLinkAndTarget = ChartBlockOutgoingLinkAndTarget;

export type ChartBlock = Entity<ChartBlockProperties>;

export type ChartBlockHasQueryLink = {
  linkEntity: HasQuery;
  rightEntity: Query;
};

export type ChartBlockOutgoingLinkAndTarget = ChartBlockHasQueryLink;

export type ChartBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1": ChartBlockHasQueryLink;
};

export type ChartBlockProperties = {
  "https://blockprotocol.org/@hash/types/property-type/chart-defintion/"?: ChartDefintionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
};

/**
 * The chart definition of something.
 */
export type ChartDefintionPropertyValue = ObjectDataType;

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
export type ObjectDataType = {};

export type Query = Entity<QueryProperties>;

export type QueryOutgoingLinkAndTarget = never;

export type QueryOutgoingLinksByLinkEntityTypeId = {};

/**
 * A structured query for data, including e.g. the types of filters to be applied in order to produce the data.
 */
export type QueryProperties = {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValue;
};

/**
 * The query for something.
 */
export type QueryPropertyValue = ObjectDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
