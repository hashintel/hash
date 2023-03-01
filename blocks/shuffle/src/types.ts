import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/shuffle-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * An item within the Shuffle Block random list, the contents of which may be a string, or some representation of another entity.
 */
export type ShuffleBlockItemPropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-id/": ShuffleBlockItemIDPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-associated-link-entity-id/"?: ShuffleBlockItemAssociatedLinkEntityIDPropertyValue;
};
/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * A unique identifier for a Shuffle Block item, used to keep track as the item is shuffled.
 */
export type ShuffleBlockItemIDPropertyValue = TextDataValue;
/**
 * The EntityId of the “Has Representative Shuffle Block Item” link entity associated with this item.
 */
export type ShuffleBlockItemAssociatedLinkEntityIDPropertyValue = TextDataValue;

/**
 * The block entity of the “Shuffle” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/shuffle
 */
export type ShuffleBlockProperties = {
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item/"?: ShuffleBlockItemPropertyValue[];
};

export type ShuffleBlock = Entity<ShuffleBlockProperties>;

/**
 * A link to an arbitrary entity which has an associated representation as a Shuffle Block Item
 */
export type HasRepresentativeShuffleBlockItemProperties = {};

export type HasRepresentativeShuffleBlockItem =
  Entity<HasRepresentativeShuffleBlockItemProperties>;
export type HasRepresentativeShuffleBlockItemLinksByLinkTypeId = {};

export type HasRepresentativeShuffleBlockItemLinkAndRightEntities = NonNullable<
  HasRepresentativeShuffleBlockItemLinksByLinkTypeId[keyof HasRepresentativeShuffleBlockItemLinksByLinkTypeId]
>;
export type ShuffleBlockHasRepresentativeShuffleBlockItemLinks =
  | []
  | {
      linkEntity: HasRepresentativeShuffleBlockItem;
      rightEntity: Entity;
    }[];

export type ShuffleBlockLinksByLinkTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-representative-shuffle-block-item/v/1": ShuffleBlockHasRepresentativeShuffleBlockItemLinks;
};

export type ShuffleBlockLinkAndRightEntities = NonNullable<
  ShuffleBlockLinksByLinkTypeId[keyof ShuffleBlockLinksByLinkTypeId]
>;

export type RootEntity = ShuffleBlock;
export type RootEntityLinkedEntities = ShuffleBlockLinkAndRightEntities;
export type RootLinkMap = ShuffleBlockLinksByLinkTypeId;
