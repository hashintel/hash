import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/entity-type/faq-block/v/4 for the root JSON Schema these types were generated from
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
 * A description of something
 */
export type DescriptionPropertyValue = TextDataValue;
/**
 * Defines whether or not ordered numbers should be displayed in a list of questions.
 */
export type ShouldDisplayQuestionNumbersPropertyValue = BooleanDataValue;
/**
 * A True or False value
 */
export type BooleanDataValue = boolean;
/**
 * Defines whether or not toggles should be displayed on questions to show/hide their correspondent answer.
 */
export type ShouldDisplayQuestionTogglesPropertyValue = BooleanDataValue;

/**
 * Contains a list of frequently asked questions (FAQs) along with their corresponding answers.
 */
export type FAQBlockProperties = {
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/"?: TitlePropertyValue;
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/should-display-question-numbers/"?: ShouldDisplayQuestionNumbersPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/should-display-question-toggles/"?: ShouldDisplayQuestionTogglesPropertyValue;
};

export type FAQBlock = Entity<FAQBlockProperties>;

/**
 * Contains a frequently asked question defined by a [Frequently Asked Question] entity.
 */
export type HasFrequentlyAskedQuestionProperties = {};

export type HasFrequentlyAskedQuestion =
  Entity<HasFrequentlyAskedQuestionProperties>;
export type HasFrequentlyAskedQuestionLinksByLinkTypeId = {};

export type HasFrequentlyAskedQuestionLinkAndRightEntities = NonNullable<
  HasFrequentlyAskedQuestionLinksByLinkTypeId[keyof HasFrequentlyAskedQuestionLinksByLinkTypeId]
>;
/**
 * A sentence that is used to request information, clarification, or confirmation about something.
 */
export type QuestionPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */

/**
 * A response to a question that provides information, clarification, or confirmation.
 */
export type AnswerPropertyValue = TextDataValue;

/**
 * Defines a single frequently asked question along with is corresponding answer within a FAQ Block.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/faq-block
 */
export type FrequentlyAskedQuestionProperties = {
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/question/"?: QuestionPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/answer/"?: AnswerPropertyValue;
};

export type FrequentlyAskedQuestion = Entity<FrequentlyAskedQuestionProperties>;
export type FrequentlyAskedQuestionLinksByLinkTypeId = {};

export type FrequentlyAskedQuestionLinkAndRightEntities = NonNullable<
  FrequentlyAskedQuestionLinksByLinkTypeId[keyof FrequentlyAskedQuestionLinksByLinkTypeId]
>;
export type FAQBlockHasFrequentlyAskedQuestionLinks =
  | []
  | {
      linkEntity: HasFrequentlyAskedQuestion;
      rightEntity: FrequentlyAskedQuestion;
    }[];

export type FAQBlockLinksByLinkTypeId = {
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/entity-type/has-frequently-asked-question/v/1": FAQBlockHasFrequentlyAskedQuestionLinks;
};

export type FAQBlockLinkAndRightEntities = NonNullable<
  FAQBlockLinksByLinkTypeId[keyof FAQBlockLinksByLinkTypeId]
>;

export type RootEntity = FAQBlock;
export type RootEntityLinkedEntities = FAQBlockLinkAndRightEntities;
export type RootLinkMap = FAQBlockLinksByLinkTypeId;
