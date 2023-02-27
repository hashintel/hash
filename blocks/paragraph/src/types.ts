import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@nate/types/entity-type/paragraph/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The text content
 */
export type Text = Text1;
/**
 * An ordered sequence of characters
 */
export type Text1 = string;

/**
 * A paragraph block
 */
export type ParagraphProperties = {
  "https://blockprotocol.org/@nate/types/property-type/text/"?: Text;
}

export type Paragraph = Entity<ParagraphProperties>;
export type ParagraphLinksByLinkTypeId = {

};

export type ParagraphLinkAndRightEntities = NonNullable<
  ParagraphLinksByLinkTypeId[keyof ParagraphLinksByLinkTypeId]
>;

export type RootEntity = Paragraph;
export type RootEntityLinkedEntities = ParagraphLinkAndRightEntities;
export type RootLinkMap = ParagraphLinksByLinkTypeId;