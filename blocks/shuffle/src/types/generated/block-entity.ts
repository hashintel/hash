/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = ShuffleBlock;

export type BlockEntityOutgoingLinkAndTarget =
  ShuffleBlockOutgoingLinkAndTarget;

export type HasRepresentativeShuffleBlockItem =
  Entity<HasRepresentativeShuffleBlockItemProperties> & { linkData: LinkData };

export type HasRepresentativeShuffleBlockItemOutgoingLinkAndTarget = never;

export type HasRepresentativeShuffleBlockItemOutgoingLinksByLinkEntityTypeId =
  {};

/**
 * A link to an arbitrary entity which has an associated representation as a Shuffle Block Item
 */
export type HasRepresentativeShuffleBlockItemProperties =
  HasRepresentativeShuffleBlockItemProperties1 &
    HasRepresentativeShuffleBlockItemProperties2;
export type HasRepresentativeShuffleBlockItemProperties1 = LinkProperties;

export type HasRepresentativeShuffleBlockItemProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

export type ShuffleBlock = Entity<ShuffleBlockProperties>;

export type ShuffleBlockHasRepresentativeShuffleBlockItemLink = {
  linkEntity: HasRepresentativeShuffleBlockItem;
  rightEntity: Entity;
};

/**
 * The EntityId of the “Has Representative Shuffle Block Item” link entity associated with this item.
 */
export type ShuffleBlockItemAssociatedLinkEntityIDPropertyValue = TextDataType;

/**
 * A unique identifier for a Shuffle Block item, used to keep track as the item is shuffled.
 */
export type ShuffleBlockItemIDPropertyValue = TextDataType;

/**
 * An item within the Shuffle Block random list, the contents of which may be a string, or some representation of another entity.
 */
export type ShuffleBlockItemPropertyValue = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-id/": ShuffleBlockItemIDPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/shuffle-block-item-associated-link-entity-id/"?: ShuffleBlockItemAssociatedLinkEntityIDPropertyValue;
};

export type ShuffleBlockOutgoingLinkAndTarget =
  ShuffleBlockHasRepresentativeShuffleBlockItemLink;

export type ShuffleBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-representative-shuffle-block-item/v/1": ShuffleBlockHasRepresentativeShuffleBlockItemLink;
};

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

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType;
