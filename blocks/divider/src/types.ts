import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@nate/types/entity-type/divider/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * CSS color
 */
export type Color = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The height of something
 */
export type Height = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;

/**
 * A line dividing two sections
 */
export type DividerProperties = {
  "https://blockprotocol.org/@nate/types/property-type/color/"?: Color;
  "https://blockprotocol.org/@nate/types/property-type/height/"?: Height;
}

export type Divider = Entity<DividerProperties>;
export type DividerLinksByLinkTypeId = {

};

export type DividerLinkAndRightEntities = NonNullable<
  DividerLinksByLinkTypeId[keyof DividerLinksByLinkTypeId]
>;

export type RootEntity = Divider;
export type RootEntityLinkedEntities = DividerLinkAndRightEntities;
export type RootLinkMap = DividerLinksByLinkTypeId;