import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/ordered-list-2/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

export type OrderedList2Properties = {}

export type OrderedList2 = Entity<OrderedList2Properties>;

/**
 * Item content
 */
export type ItemContent2Properties = ItemContent2Properties1 & ItemContent2Properties2;
export type ItemContent2Properties1 = Link;

export type Link = {
  leftEntityId?: string;
  rightEntityId?: string;
}
export type ItemContent2Properties2 = {}

export type ItemContent2 = Entity<ItemContent2Properties>;
export type ItemContent2LinksByLinkTypeId = {

};

export type ItemContent2LinkAndRightEntities = NonNullable<
  ItemContent2LinksByLinkTypeId[keyof ItemContent2LinksByLinkTypeId]
>;
/**
 * Textual content
 */
export type Content = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;

export type ListItem2Properties = {
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/content/": Content;
}

export type ListItem2 = Entity<ListItem2Properties>;
export type ListItem2LinksByLinkTypeId = {

};

export type ListItem2LinkAndRightEntities = NonNullable<
  ListItem2LinksByLinkTypeId[keyof ListItem2LinksByLinkTypeId]
>;
export type OrderedList2ItemContent2Links = [] |
  {
    linkEntity: ItemContent2;
    rightEntity: ListItem2;
  }[];

export type OrderedList2LinksByLinkTypeId = {
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/item-content-2/v/1": OrderedList2ItemContent2Links;
};

export type OrderedList2LinkAndRightEntities = NonNullable<
  OrderedList2LinksByLinkTypeId[keyof OrderedList2LinksByLinkTypeId]
>;

export type RootEntity = OrderedList2;
export type RootEntityLinkedEntities = OrderedList2LinkAndRightEntities;
export type RootLinkMap = OrderedList2LinksByLinkTypeId;