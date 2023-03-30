/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

/**
 * A response to a question that provides information, clarification, or confirmation.
 */
export type AnswerPropertyValue = Text;

/**
 * Defines whether or not toggles should be displayed on questions to show/hide their respective answer.
 */
export type AnswerVisibilityIsConfigurablePropertyValue = Boolean;

export type BlockEntity = FAQBlock;

export type BlockEntityOutgoingLinkAndTarget = FAQBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = Text;

export type FAQBlock = Entity<FAQBlockProperties>;

export type FAQBlockHasFrequentlyAskedQuestionLinks = {
  linkEntity: HasFrequentlyAskedQuestion;
  rightEntity: FrequentlyAskedQuestion;
};

export type FAQBlockOutgoingLinkAndTarget =
  FAQBlockHasFrequentlyAskedQuestionLinks;

export type FAQBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/has-frequently-asked-question/v/1": FAQBlockHasFrequentlyAskedQuestionLinks;
};

export type FAQBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/sections-should-be-numbered/"?: SectionsShouldBeNumberedPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/answer-visibility-is-configurable/"?: AnswerVisibilityIsConfigurablePropertyValue;
};

export type FrequentlyAskedQuestion = Entity<FrequentlyAskedQuestionProperties>;

export type FrequentlyAskedQuestionOutgoingLinkAndTarget = never;

export type FrequentlyAskedQuestionOutgoingLinksByLinkEntityTypeId = {};

export type FrequentlyAskedQuestionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/question/"?: QuestionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/answer/"?: AnswerPropertyValue;
};

export type HasFrequentlyAskedQuestion =
  Entity<HasFrequentlyAskedQuestionProperties> & { linkData: LinkData };

export type HasFrequentlyAskedQuestionOutgoingLinkAndTarget = never;

export type HasFrequentlyAskedQuestionOutgoingLinksByLinkEntityTypeId = {};

/**
 * Contains a frequently asked question defined by a [Frequently Asked Question] entity.
 */
export type HasFrequentlyAskedQuestionProperties =
  HasFrequentlyAskedQuestionProperties1 & HasFrequentlyAskedQuestionProperties2;
export type HasFrequentlyAskedQuestionProperties1 = LinkProperties;

export type HasFrequentlyAskedQuestionProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * A sentence that is used to request information, clarification, or confirmation about something.
 */
export type QuestionPropertyValue = Text;

/**
 * Defines whether or not sections should be numbered.
 */
export type SectionsShouldBeNumberedPropertyValue = Boolean;

/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * The name given to something to identify it, generally associated with objects or inanimate things such as books, websites, songs, etc.
 */
export type TitlePropertyValue = Text;
