import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/stopwatch-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The number of milliseconds elapsed in a lap of the stopwatch, expressed as a non-negative integer.
 */
export type StopwatchBlockLapPropertyValue = NumberDataValue;
/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataValue = number;
/**
 * An ISO-8601 formatted date and time which identifies the start of something.
 *
 * For example: “2233-03-22T13:30:23Z”
 */
export type StartTimePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;

/**
 * The root entity of the “Stopwatch” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/stopwatch
 */
export type StopwatchBlockProperties = {
  /**
   * @minItems 0
   */
  "https://blockprotocol.org/@hash/types/property-type/stopwatch-block-lap/"?: StopwatchBlockLapPropertyValue[];
  "https://blockprotocol.org/@hash/types/property-type/start-time/"?: StartTimePropertyValue;
};

export type StopwatchBlock = Entity<StopwatchBlockProperties>;
export type StopwatchBlockLinksByLinkTypeId = {};

export type StopwatchBlockLinkAndRightEntities = NonNullable<
  StopwatchBlockLinksByLinkTypeId[keyof StopwatchBlockLinksByLinkTypeId]
>;

export type RootEntity = StopwatchBlock;
export type RootEntityLinkedEntities = StopwatchBlockLinkAndRightEntities;
export type RootLinkMap = StopwatchBlockLinksByLinkTypeId;
