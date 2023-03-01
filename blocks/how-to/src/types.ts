import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbet/types/entity-type/how-to-block/v/4 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The title of something
 */
export type TitlePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataValue;

/**
 * A step-by-step guide on how to do or achieve something.
 */
export type HowToBlockProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-87igvkbkw.stage.hash.ai/@alfie/types/property-type/description/"?: DescriptionPropertyValue;
};

export type HowToBlock = Entity<HowToBlockProperties>;

/**
 * Defines a single step that belongs to a How-To Block entity.
 */
export type HasHowToBlockStepProperties = {};

export type HasHowToBlockStep = Entity<HasHowToBlockStepProperties>;
export type HasHowToBlockStepLinksByLinkTypeId = {};

export type HasHowToBlockStepLinkAndRightEntities = NonNullable<
  HasHowToBlockStepLinksByLinkTypeId[keyof HasHowToBlockStepLinksByLinkTypeId]
>;
/**
 * The title of something
 */

/**
 * An ordered sequence of characters
 */

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */

/**
 * Defines a single step that belongs to a How-To Block entity.
 */
export type HowToBlockStepProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-87igvkbkw.stage.hash.ai/@alfie/types/property-type/description/"?: DescriptionPropertyValue;
};

export type HowToBlockStep = Entity<HowToBlockStepProperties>;
export type HowToBlockStepLinksByLinkTypeId = {};

export type HowToBlockStepLinkAndRightEntities = NonNullable<
  HowToBlockStepLinksByLinkTypeId[keyof HowToBlockStepLinksByLinkTypeId]
>;
export type HowToBlockHasHowToBlockStepLinks =
  | []
  | {
      linkEntity: HasHowToBlockStep;
      rightEntity: HowToBlockStep;
    }[];

/**
 * Contains an introduction defined by a How-To Introduction entity.
 */
export type HasHowToBlockIntroductionProperties = {};

export type HasHowToBlockIntroduction =
  Entity<HasHowToBlockIntroductionProperties>;
export type HasHowToBlockIntroductionLinksByLinkTypeId = {};

export type HasHowToBlockIntroductionLinkAndRightEntities = NonNullable<
  HasHowToBlockIntroductionLinksByLinkTypeId[keyof HasHowToBlockIntroductionLinksByLinkTypeId]
>;
/**
 * The title of something
 */

/**
 * An ordered sequence of characters
 */

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */

/**
 * Describes any pre-requisites necessary for completing a subsequent set of steps (specifically How-To Block Steps).
 */
export type HowToBlockIntroductionProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-87igvkbkw.stage.hash.ai/@alfie/types/property-type/description/"?: DescriptionPropertyValue;
};

export type HowToBlockIntroduction = Entity<HowToBlockIntroductionProperties>;
export type HowToBlockIntroductionLinksByLinkTypeId = {};

export type HowToBlockIntroductionLinkAndRightEntities = NonNullable<
  HowToBlockIntroductionLinksByLinkTypeId[keyof HowToBlockIntroductionLinksByLinkTypeId]
>;
export type HowToBlockHasHowToBlockIntroductionLinks =
  | []
  | {
      linkEntity: HasHowToBlockIntroduction;
      rightEntity: HowToBlockIntroduction;
    }[];

export type HowToBlockLinksByLinkTypeId = {
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbet/types/entity-type/has-how-to-block-step/v/1": HowToBlockHasHowToBlockStepLinks;
  "https://blockprotocol-o5q8a2drq.stage.hash.ai/@luisbet/types/entity-type/has-how-to-block-introduction/v/1": HowToBlockHasHowToBlockIntroductionLinks;
};

export type HowToBlockLinkAndRightEntities = NonNullable<
  HowToBlockLinksByLinkTypeId[keyof HowToBlockLinksByLinkTypeId]
>;

export type RootEntity = HowToBlock;
export type RootEntityLinkedEntities = HowToBlockLinkAndRightEntities;
export type RootLinkMap = HowToBlockLinksByLinkTypeId;
