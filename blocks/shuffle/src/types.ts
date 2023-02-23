import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/entity-type/ordered-list-2/v/9 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * An item in a list
 */
export type ListItem = {
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/link-entity-id/"?: LinkEntityId;
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/": ID;
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/content/"?: Content;
};
/**
 * A link representing the real value of the entity/object this property is stored on
 */
export type LinkEntityId = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * An arbitrary ID
 */
export type ID = Text;
/**
 * Textual content
 */
export type Content = Text;

export type OrderedList2Properties = {
  /**
   * @minItems 0
   */
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/list-item/": ListItem[];
};

export type OrderedList2 = Entity<OrderedList2Properties>;

/**
 * Item content
 */
export type ItemContent2Properties = ItemContent2Properties1 &
  ItemContent2Properties2;
export type ItemContent2Properties1 = Link;

export type Link = {
  leftEntityId?: string;
  rightEntityId?: string;
};
export type ItemContent2Properties2 = {};

export type ItemContent2 = Entity<ItemContent2Properties>;
export type ItemContent2LinksByLinkTypeId = {};

export type ItemContent2LinkAndRightEntities = NonNullable<
  ItemContent2LinksByLinkTypeId[keyof ItemContent2LinksByLinkTypeId]
>;
export type OrderedList2ItemContent2Links =
  | []
  | {
      linkEntity: ItemContent2;
      rightEntity: Entity;
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
