import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/entity-type/frequently-asked-question/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * A sentence that is used to request information, clarification, or confirmation about something.
 */
export type QuestionPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
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

/**
 * An ordered sequence of characters
 */

/**
 * A response to a question that provides information, clarification, or confirmation.
 */

/**
 * Defines a single frequently asked question along with is corresponding answer within a FAQ Block.
 *
 * See: https://blockprotocol.org/@hash/types/entity-type/faq-block
 */
export type FrequentlyAskedQuestionV1Properties = {
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/question/"?: QuestionPropertyValue;
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/property-type/answer/"?: AnswerPropertyValue;
};

export type FrequentlyAskedQuestionV1 =
  Entity<FrequentlyAskedQuestionV1Properties>;
export type FrequentlyAskedQuestionV1LinksByLinkTypeId = {};

export type FrequentlyAskedQuestionV1LinkAndRightEntities = NonNullable<
  FrequentlyAskedQuestionV1LinksByLinkTypeId[keyof FrequentlyAskedQuestionV1LinksByLinkTypeId]
>;
export type FrequentlyAskedQuestionHasFrequentlyAskedQuestionLinks =
  | []
  | {
      linkEntity: HasFrequentlyAskedQuestion;
      rightEntity: FrequentlyAskedQuestionV1;
    }[];

export type FrequentlyAskedQuestionLinksByLinkTypeId = {
  "https://blockprotocol-7cpmxox21.stage.hash.ai/@luisbett/types/entity-type/has-frequently-asked-question/v/1": FrequentlyAskedQuestionHasFrequentlyAskedQuestionLinks;
};

export type FrequentlyAskedQuestionLinkAndRightEntities = NonNullable<
  FrequentlyAskedQuestionLinksByLinkTypeId[keyof FrequentlyAskedQuestionLinksByLinkTypeId]
>;

export type RootEntity = FrequentlyAskedQuestion;
export type RootEntityLinkedEntities =
  FrequentlyAskedQuestionLinkAndRightEntities;
export type RootLinkMap = FrequentlyAskedQuestionLinksByLinkTypeId;
