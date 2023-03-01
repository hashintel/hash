import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/timer-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Defines the relative offsets of the timer block when in a paused or unpaused state, respective to the total duration.
 *
 * See:
 * - https://blockprotocol.org/@hash/types/property-type/timer-block-total-duration.
 * - https://blockprotocol.org/@hash/blocks/timer
 */
export type TimerBlockProgressPropertyValue =
  | {
      "https://blockprotocol.org/@hash/types/property-type/target-date-and-time/": TargetDateAndTimePropertyValue;
    }
  | {
      "https://blockprotocol.org/@hash/types/property-type/timer-block-pause-duration/": TimerBlockPauseDurationPropertyValue;
    };
/**
 * An ISO-8601 formatted date and time that acts as the target for something.
 *
 * For example: “2233-03-22T13:30:23Z”
 */
export type TargetDateAndTimePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * An ISO-8601 formatted duration, which remaining duration on the timer block when it has been paused. The elapsed time can be calculated by subtracting this value from the total duration.
 *
 * For example: `PT42M24S` corresponds to 42 minutes and 24 seconds.
 *
 * See: https://blockprotocol.org/@hash/blocks/timer
 */
export type TimerBlockPauseDurationPropertyValue = TextDataValue;
/**
 * An ISO-8601 formatted duration, which is the total duration the timer will countdown for once the play button is clicked.
 *
 * For example: `PT42M24S` corresponds to 42 minutes and 24 seconds.
 *
 * See: https://blockprotocol.org/@hash/blocks/timer
 */
export type TimerBlockTotalDurationPropertyValue = TextDataValue;

/**
 * The block entity for the “Timer” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/timer
 */
export type TimerBlockProperties = {
  "https://blockprotocol.org/@hash/types/property-type/timer-block-progress/"?: TimerBlockProgressPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/timer-block-total-duration/"?: TimerBlockTotalDurationPropertyValue;
};

export type TimerBlock = Entity<TimerBlockProperties>;
export type TimerBlockLinksByLinkTypeId = {};

export type TimerBlockLinkAndRightEntities = NonNullable<
  TimerBlockLinksByLinkTypeId[keyof TimerBlockLinksByLinkTypeId]
>;

export type RootEntity = TimerBlock;
export type RootEntityLinkedEntities = TimerBlockLinkAndRightEntities;
export type RootLinkMap = TimerBlockLinksByLinkTypeId;
