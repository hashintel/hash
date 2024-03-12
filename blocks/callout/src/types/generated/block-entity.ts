/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = CalloutBlock;

export type BlockEntityOutgoingLinkAndTarget =
  CalloutBlockOutgoingLinkAndTarget;

export type CalloutBlock = Entity<CalloutBlockProperties>;

/**
 * A Unicode emoji displayed along the textual contents of a Callout block.
 *
 * See: https://unicode.org/emoji/charts/full-emoji-list.html
 */
export type CalloutBlockEmojiPropertyValue = TextDataType;

export type CalloutBlockOutgoingLinkAndTarget = never;

export type CalloutBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity for the “Callout” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/callout
 */
export type CalloutBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/callout-block-emoji/"?: CalloutBlockEmojiPropertyValue;
};

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType | ObjectDataType[];
