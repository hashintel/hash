/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@blockprotocol/graph";

export type BlockEntity = ParagraphBlock;

export type BlockEntityOutgoingLinkAndTarget =
  ParagraphBlockOutgoingLinkAndTarget;

/**
 * An opaque, untyped JSON object.
 */
export interface ObjectDataType {}

export type ParagraphBlock = Entity<ParagraphBlockProperties>;

export type ParagraphBlockOutgoingLinkAndTarget = never;

export interface ParagraphBlockOutgoingLinksByLinkEntityTypeId {}

/**
 * The block entity for the “Paragraph” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/paragraph.
 */
export interface ParagraphBlockProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
}

/**
 * An ordered sequence of characters.
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType | ObjectDataType[];
