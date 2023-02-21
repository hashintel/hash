import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/entity-type/timer/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The initial duration of an entity
 */
export type InitialDuration = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The duration of a pause
 */
export type PauseDuration = Text;
/**
 * Target date and time
 */
export type TargetDateTime = Text;

export type TimerProperties = {
  "https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/property-type/initial-duration/": InitialDuration;
  "https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/property-type/pause-duration/"?: PauseDuration;
  "https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/property-type/target-date-time/"?: TargetDateTime;
}

export type Timer = Entity<TimerProperties>;
export type TimerLinksByLinkTypeId = {

};

export type TimerLinkAndRightEntities = NonNullable<
  TimerLinksByLinkTypeId[keyof TimerLinksByLinkTypeId]
>;

export type RootEntity = Timer;
export type RootEntityLinkedEntities = TimerLinkAndRightEntities;
export type RootLinkMap = TimerLinksByLinkTypeId;