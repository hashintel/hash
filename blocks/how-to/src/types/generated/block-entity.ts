/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = HowToBlock;

export type BlockEntityOutgoingLinkAndTarget = HowToBlockOutgoingLinkAndTarget;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type HasHowToBlockIntroduction =
  Entity<HasHowToBlockIntroductionProperties> & { linkData: LinkData };

export type HasHowToBlockIntroductionOutgoingLinkAndTarget = never;

export type HasHowToBlockIntroductionOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains a How-To Block Introduction
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block-introduction
 */
export type HasHowToBlockIntroductionProperties =
  HasHowToBlockIntroductionProperties1 & HasHowToBlockIntroductionProperties2;
export type HasHowToBlockIntroductionProperties1 = LinkProperties;

export type HasHowToBlockIntroductionProperties2 = {};

export type HasHowToBlockStep = Entity<HasHowToBlockStepProperties> & {
  linkData: LinkData;
};

export type HasHowToBlockStepOutgoingLinkAndTarget = never;

export type HasHowToBlockStepOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains a How-To Block step.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block-step
 */
export type HasHowToBlockStepProperties = HasHowToBlockStepProperties1 &
  HasHowToBlockStepProperties2;
export type HasHowToBlockStepProperties1 = LinkProperties;

export type HasHowToBlockStepProperties2 = {};

export type HowToBlock = Entity<HowToBlockProperties>;

export type HowToBlockHasHowToBlockIntroductionLink = {
  linkEntity: HasHowToBlockIntroduction;
  rightEntity: HowToBlockIntroduction;
};

export type HowToBlockHasHowToBlockStepLink = {
  linkEntity: HasHowToBlockStep;
  rightEntity: HowToBlockStep;
};

export type HowToBlockIntroduction = Entity<HowToBlockIntroductionProperties>;

export type HowToBlockIntroductionOutgoingLinkAndTarget = never;

export type HowToBlockIntroductionOutgoingLinksByLinkEntityTypeId = {};

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

export type HowToBlockOutgoingLinkAndTarget =
  | HowToBlockHasHowToBlockStepLink
  | HowToBlockHasHowToBlockIntroductionLink;

export type HowToBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-step/v/1": HowToBlockHasHowToBlockStepLink;
  "https://blockprotocol.org/@hash/types/entity-type/has-how-to-block-introduction/v/1": HowToBlockHasHowToBlockIntroductionLink;
};

/**
 * The block entity for the "How-To" block.
 *
 * See: https://blockprotocol.org/@hash/blocks/how-to
 */
export type HowToBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
};

export type HowToBlockStep = Entity<HowToBlockStepProperties>;

export type HowToBlockStepOutgoingLinkAndTarget = never;

export type HowToBlockStepOutgoingLinksByLinkEntityTypeId = {};

/**
 * Defines a single step within a How-To Block.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/how-to-block
 */
export type HowToBlockStepProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
