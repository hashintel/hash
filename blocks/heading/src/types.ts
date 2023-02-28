import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@nate/types/entity-type/heading/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The size of something
 */
export type Level = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * CSS color
 */
export type Color = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The text content
 */
export type Text1 = Text;

/**
 * Big text
 */
export type HeadingProperties = {
  "https://blockprotocol.org/@nate/types/property-type/level/"?: Level;
  "https://blockprotocol.org/@nate/types/property-type/color/"?: Color;
  "https://blockprotocol.org/@nate/types/property-type/text/"?: Text1;
}

export type Heading = Entity<HeadingProperties>;
export type HeadingLinksByLinkTypeId = {

};

export type HeadingLinkAndRightEntities = NonNullable<
  HeadingLinksByLinkTypeId[keyof HeadingLinksByLinkTypeId]
>;

export type RootEntity = Heading;
export type RootEntityLinkedEntities = HeadingLinkAndRightEntities;
export type RootLinkMap = HeadingLinksByLinkTypeId;