import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/callout-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * A unicode emoji displayed along the textual contents of a Callout block.
 *
 * See: https://unicode.org/emoji/charts/full-emoji-list.html
 */
export type CalloutBlockEmojiPropertyValue = TextDataValue;

/**
 * The block entity for the “Callout” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/callout
 */
export type CalloutBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/callout-block-emoji/"?: CalloutBlockEmojiPropertyValue;
};

export type CalloutBlock = Entity<CalloutBlockProperties>;
export type CalloutBlockLinksByLinkTypeId = {};

export type CalloutBlockLinkAndRightEntities = NonNullable<
  CalloutBlockLinksByLinkTypeId[keyof CalloutBlockLinksByLinkTypeId]
>;

export type RootEntity = CalloutBlock;
export type RootEntityLinkedEntities = CalloutBlockLinkAndRightEntities;
export type RootLinkMap = CalloutBlockLinksByLinkTypeId;
