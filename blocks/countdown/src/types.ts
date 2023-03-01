import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/countdown-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * An ISO-8601 formatted date and time that acts as the target for something.
 *
 * For example: “2233-03-22T13:30:23Z”
 */
export type TargetDateAndTimePropertyValue = TextDataValue;
/**
 * Whether or not the Countdown block should display granular time-related information, or just date information.
 *
 * See: https://blockprotocol.org/@hash/blocks/countdown
 */
export type CountdownBlockShouldDisplayTimePropertyValue = BooleanDataValue;
/**
 * A True or False value
 */
export type BooleanDataValue = boolean;

/**
 * The block entity for the “Countdown” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/countdown
 */
export type CountdownBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/target-date-and-time/"?: TargetDateAndTimePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/countdown-block-should-display-time/"?: CountdownBlockShouldDisplayTimePropertyValue;
};

export type CountdownBlock = Entity<CountdownBlockProperties>;
export type CountdownBlockLinksByLinkTypeId = {};

export type CountdownBlockLinkAndRightEntities = NonNullable<
  CountdownBlockLinksByLinkTypeId[keyof CountdownBlockLinksByLinkTypeId]
>;

export type RootEntity = CountdownBlock;
export type RootEntityLinkedEntities = CountdownBlockLinkAndRightEntities;
export type RootLinkMap = CountdownBlockLinksByLinkTypeId;
