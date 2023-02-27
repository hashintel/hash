import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see http://localhost:3000/@lbett/types/entity-type/howto-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Title of something
 */
export type Title = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * Description of something
 */
export type Description = Text;

/**
 * HowTo Block root entity
 */
export type HowToBlockProperties = {
  "http://localhost:3000/@lbett/types/property-type/title/"?: Title;
  "http://localhost:3000/@lbett/types/property-type/description/"?: Description;
};

export type HowToBlock = Entity<HowToBlockProperties>;

/**
 * Link to a step
 */
export type StepLinkProperties = {};

export type StepLink = Entity<StepLinkProperties>;
export type StepLinkLinksByLinkTypeId = {};

export type StepLinkLinkAndRightEntities = NonNullable<
  StepLinkLinksByLinkTypeId[keyof StepLinkLinksByLinkTypeId]
>;
/**
 * Title of something
 */

/**
 * An ordered sequence of characters
 */

/**
 * Description of something
 */

/**
 * Step belonging to a HowTo Block
 */
export type HowToStepProperties = {
  "http://localhost:3000/@lbett/types/property-type/title/"?: Title;
  "http://localhost:3000/@lbett/types/property-type/description/"?: Description;
};

export type HowToStep = Entity<HowToStepProperties>;
export type HowToStepLinksByLinkTypeId = {};

export type HowToStepLinkAndRightEntities = NonNullable<
  HowToStepLinksByLinkTypeId[keyof HowToStepLinksByLinkTypeId]
>;
export type HowToBlockStepLinkLinks =
  | []
  | {
      linkEntity: StepLink;
      rightEntity: HowToStep;
    }[];

/**
 * Link to the introduction
 */
export type IntroductionLinkProperties = {};

export type IntroductionLink = Entity<IntroductionLinkProperties>;
export type IntroductionLinkLinksByLinkTypeId = {};

export type IntroductionLinkLinkAndRightEntities = NonNullable<
  IntroductionLinkLinksByLinkTypeId[keyof IntroductionLinkLinksByLinkTypeId]
>;

export type HowToBlockIntroductionLinkLinks =
  | []
  | {
      linkEntity: IntroductionLink;
      rightEntity: HowToStep;
    }[];

export type HowToBlockLinksByLinkTypeId = {
  "http://localhost:3000/@lbett/types/entity-type/step-link/v/1": HowToBlockStepLinkLinks;
  "http://localhost:3000/@lbett/types/entity-type/introduction-link/v/1": HowToBlockIntroductionLinkLinks;
};

export type HowToBlockLinkAndRightEntities = NonNullable<
  HowToBlockLinksByLinkTypeId[keyof HowToBlockLinksByLinkTypeId]
>;

export type RootEntity = HowToBlock;
export type RootEntityLinkedEntities = HowToBlockLinkAndRightEntities;
export type RootLinkMap = HowToBlockLinksByLinkTypeId;
