import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@nate/types/entity-type/callout/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * An emoji for an entity
 */
export type Emoji = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The text content
 */
export type Text1 = Text;

/**
 * A callout
 */
export type CalloutProperties = {
  "https://blockprotocol.org/@nate/types/property-type/emoji/"?: Emoji;
  "https://blockprotocol.org/@nate/types/property-type/text/"?: Text1;
}

export type Callout = Entity<CalloutProperties>;
export type CalloutLinksByLinkTypeId = {

};

export type CalloutLinkAndRightEntities = NonNullable<
  CalloutLinksByLinkTypeId[keyof CalloutLinksByLinkTypeId]
>;

export type RootEntity = Callout;
export type RootEntityLinkedEntities = CalloutLinkAndRightEntities;
export type RootLinkMap = CalloutLinksByLinkTypeId;