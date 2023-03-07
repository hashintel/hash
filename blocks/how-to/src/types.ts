import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/how-to-block/v/2 for the root JSON Schema these types were generated from
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
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataValue;

/**
 * The block entity for the "How-To" block.
 *
 * See: https://blockprotocol.org/@hash/blocks/how-to
 */
export type HowToBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
};

export type HowToBlock = Entity<HowToBlockProperties>;

/**
 * Contains a How-To Block step.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block-step
 */
export type HasHowToBlockStepProperties = {};

export type HasHowToBlockStep = Entity<HasHowToBlockStepProperties>;
export type HasHowToBlockStepLinksByLinkTypeId = {};

export type HasHowToBlockStepLinkAndRightEntities = NonNullable<
  HasHowToBlockStepLinksByLinkTypeId[keyof HasHowToBlockStepLinksByLinkTypeId]
>;
/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */

/**
 * An ordered sequence of characters
 */

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */

/**
 * Defines a single step within a How-To Block.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block
 */
export type HowToBlockStepProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
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
 * Contains a How-To Block Introduction
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block-introduction
 */
export type HasHowToBlockIntroductionProperties = {};

export type HasHowToBlockIntroduction =
  Entity<HasHowToBlockIntroductionProperties>;
export type HasHowToBlockIntroductionLinksByLinkTypeId = {};

export type HasHowToBlockIntroductionLinkAndRightEntities = NonNullable<
  HasHowToBlockIntroductionLinksByLinkTypeId[keyof HasHowToBlockIntroductionLinksByLinkTypeId]
>;
/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */

/**
 * An ordered sequence of characters
 */

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */

/**
 * A short description or precursor that explains the process that’s defined within the How-To block, or defines any preliminary context.
 *
 * It also often describes any pre-requisites necessary for completing the subsequent set of “How-To Block Step”s.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block-step
 */
export type HowToBlockIntroductionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
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
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-step/v/1": HowToBlockHasHowToBlockStepLinks;
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-introduction/v/1": HowToBlockHasHowToBlockIntroductionLinks;
};

export type HowToBlockLinkAndRightEntities = NonNullable<
  HowToBlockLinksByLinkTypeId[keyof HowToBlockLinksByLinkTypeId]
>;

export type RootEntity = HowToBlock;
export type RootEntityLinkedEntities = HowToBlockLinkAndRightEntities;
export type RootLinkMap = HowToBlockLinksByLinkTypeId;
