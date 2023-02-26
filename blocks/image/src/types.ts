import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@nate/types/entity-type/media/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The width of something
 */
export type Width = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * A string describing something
 */
export type Caption = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The location of something
 */
export type URL = Text;

/**
 * An entity which describes media
 */
export type MediaProperties = {
  "https://blockprotocol.org/@nate/types/property-type/width/"?: Width;
  "https://blockprotocol.org/@nate/types/property-type/caption/"?: Caption;
  "https://blockprotocol.org/@nate/types/property-type/url/"?: URL;
}

export type Media = Entity<MediaProperties>;
export type MediaLinksByLinkTypeId = {

};

export type MediaLinkAndRightEntities = NonNullable<
  MediaLinksByLinkTypeId[keyof MediaLinksByLinkTypeId]
>;

export type RootEntity = Media;
export type RootEntityLinkedEntities = MediaLinkAndRightEntities;
export type RootLinkMap = MediaLinksByLinkTypeId;