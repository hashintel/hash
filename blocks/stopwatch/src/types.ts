import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/entity-type/stopwatch-block/v/3 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The number of seconds elapsed for each lap on a stopwatch
 */
export type StopwatchLaps = Number[];
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * The start time of a stopwatch
 */
export type StopwatchStartTime = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * An entity belonging to the Stopwatch Block
 */
export type StopwatchBlockProperties = {
  "https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/property-type/stopwatch-laps/"?: StopwatchLaps;
  "https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/property-type/stopwatch-start-time/"?: StopwatchStartTime;
}

export type StopwatchBlock = Entity<StopwatchBlockProperties>;
export type StopwatchBlockLinksByLinkTypeId = {

};

export type StopwatchBlockLinkAndRightEntities = NonNullable<
  StopwatchBlockLinksByLinkTypeId[keyof StopwatchBlockLinksByLinkTypeId]
>;

export type RootEntity = StopwatchBlock;
export type RootEntityLinkedEntities = StopwatchBlockLinkAndRightEntities;
export type RootLinkMap = StopwatchBlockLinksByLinkTypeId;