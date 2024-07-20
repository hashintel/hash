/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@blockprotocol/graph";

/**
 * A response to a question that provides information, clarification, or confirmation.
 */
export type AnswerPropertyValue = TextDataType;

/**
 * Defines whether or not toggles should be displayed on questions to show/hide their respective answer.
 */
export type AnswerVisibilityIsConfigurablePropertyValue = BooleanDataType;

export type BlockEntity = FAQBlock;

export type BlockEntityOutgoingLinkAndTarget = FAQBlockOutgoingLinkAndTarget;

/**
 * A True or False value.
 */
export type BooleanDataType = boolean;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type FAQBlock = Entity<FAQBlockProperties>;

export interface FAQBlockHasFrequentlyAskedQuestionLink {
  linkEntity: HasFrequentlyAskedQuestion;
  rightEntity: FrequentlyAskedQuestion;
}

export type FAQBlockOutgoingLinkAndTarget =
  FAQBlockHasFrequentlyAskedQuestionLink;

export interface FAQBlockOutgoingLinksByLinkEntityTypeId {
  "https://blockprotocol.org/@hash/types/entity-type/has-frequently-asked-question/v/1": FAQBlockHasFrequentlyAskedQuestionLink;
}

export interface FAQBlockProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/sections-should-be-numbered/"?: SectionsShouldBeNumberedPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/answer-visibility-is-configurable/"?: AnswerVisibilityIsConfigurablePropertyValue;
}

export type FrequentlyAskedQuestion = Entity<FrequentlyAskedQuestionProperties>;

export type FrequentlyAskedQuestionOutgoingLinkAndTarget = never;

export interface FrequentlyAskedQuestionOutgoingLinksByLinkEntityTypeId {}

export interface FrequentlyAskedQuestionProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/question/"?: QuestionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/answer/"?: AnswerPropertyValue;
}

export type HasFrequentlyAskedQuestion =
  Entity<HasFrequentlyAskedQuestionProperties> & { linkData: LinkData };

export type HasFrequentlyAskedQuestionOutgoingLinkAndTarget = never;

export interface HasFrequentlyAskedQuestionOutgoingLinksByLinkEntityTypeId {}

/**
 * Contains a frequently asked question defined by a [Frequently Asked Question] entity.
 */
export type HasFrequentlyAskedQuestionProperties =
  HasFrequentlyAskedQuestionProperties1 & HasFrequentlyAskedQuestionProperties2;
export type HasFrequentlyAskedQuestionProperties1 = LinkProperties;

export interface HasFrequentlyAskedQuestionProperties2 {}

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId {}

export interface LinkProperties {}

/**
 * A sentence that is used to request information, clarification, or confirmation about something.
 */
export type QuestionPropertyValue = TextDataType;

/**
 * Defines whether or not sections should be numbered.
 */
export type SectionsShouldBeNumberedPropertyValue = BooleanDataType;

/**
 * An ordered sequence of characters.
 */
export type TextDataType = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = TextDataType;
