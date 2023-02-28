import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/entity-type/countdown/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The title of something
 */
export type Title = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * Target date and time
 */
export type TargetDateTime = Text;
/**
 * Whether to display the time or not
 */
export type DisplayTime = Boolean;
/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * A countdown to a date and time
 */
export type CountdownProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: Title;
  "https://blockprotocol-ae37rxcaw.stage.hash.ai/@nate/types/property-type/target-date-time/"?: TargetDateTime;
  "https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/property-type/display-time/"?: DisplayTime;
};

export type Countdown = Entity<CountdownProperties>;
export type CountdownLinksByLinkTypeId = {};

export type CountdownLinkAndRightEntities = NonNullable<
  CountdownLinksByLinkTypeId[keyof CountdownLinksByLinkTypeId]
>;

export type RootEntity = Countdown;
export type RootEntityLinkedEntities = CountdownLinkAndRightEntities;
export type RootLinkMap = CountdownLinksByLinkTypeId;
