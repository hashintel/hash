import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/paragraph-block/v/2 for the root JSON Schema these types were generated from
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
 * The root entity for the “Paragraph” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/paragraph
 */
export type ParagraphBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type ParagraphBlock = Entity<ParagraphBlockProperties>;
export type ParagraphBlockLinksByLinkTypeId = {};

export type ParagraphBlockLinkAndRightEntities = NonNullable<
  ParagraphBlockLinksByLinkTypeId[keyof ParagraphBlockLinksByLinkTypeId]
>;

export type RootEntity = ParagraphBlock;
export type RootEntityLinkedEntities = ParagraphBlockLinkAndRightEntities;
export type RootLinkMap = ParagraphBlockLinksByLinkTypeId;
