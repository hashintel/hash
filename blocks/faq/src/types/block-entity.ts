/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

/**
 * A response to a question that provides information, clarification, or confirmation.
 */
export type AnswerPropertyValue = Text;

export type BlockEntity = FAQBlock;

export type BlockEntityOutgoingLinkAndTarget = FAQBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * A description of something
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
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/entity-type/has-frequently-asked-question/v/1": FAQBlockHasFrequentlyAskedQuestionLinks;
};

/**
 * Contains a list of frequently asked questions (FAQs) along with their corresponding answers.
 */
export type FAQBlockProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/should-display-question-numbers/"?: ShouldDisplayQuestionNumbersPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/should-display-question-toggles/"?: ShouldDisplayQuestionTogglesPropertyValue;
};

export type FrequentlyAskedQuestion = Entity<FrequentlyAskedQuestionProperties>;

export type FrequentlyAskedQuestionOutgoingLinkAndTarget = never;

export type FrequentlyAskedQuestionOutgoingLinksByLinkEntityTypeId = {};

/**
 * Defines a single frequently asked question along with is corresponding answer within a FAQ Block.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/faq-block
 */
export type FrequentlyAskedQuestionProperties = {
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/question/"?: QuestionPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/answer/"?: AnswerPropertyValue;
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
 * Defines whether or not ordered numbers should be displayed in a list of questions.
 */
export type ShouldDisplayQuestionNumbersPropertyValue = Boolean;

/**
 * Defines whether or not toggles should be displayed on questions to show/hide their correspondent answer.
 */
export type ShouldDisplayQuestionTogglesPropertyValue = Boolean;

/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * The title of something
 */
export type TitlePropertyValue = Text;
