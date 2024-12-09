/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = CountdownBlock;

export type BlockEntityOutgoingLinkAndTarget =
  CountdownBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type CountdownBlock = Entity<CountdownBlockProperties>;

export type CountdownBlockOutgoingLinkAndTarget = never;

export type CountdownBlockOutgoingLinksByLinkEntityTypeId = {};

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

/**
 * Whether or not the Countdown block should display granular time-related information, or just date information.
 *
 * See: https://blockprotocol.org/@hash/blocks/countdown
 */
export type CountdownBlockShouldDisplayTimePropertyValue = BooleanDataType;

/**
 * An ISO-8601 formatted date and time that acts as the target for something.
 *
 * For example: “2233-03-22T13:30:23Z”
 */
export type TargetDateAndTimePropertyValue = TextDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
