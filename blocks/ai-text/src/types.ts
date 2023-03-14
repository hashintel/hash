import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/ai-text-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The name of an OpenAI model supported by the Block Protocol service module, which is capable of producing text outputs.
 *
 * This should match the strings within the GPT-3 section of the OpenAI docs, for example: “text-davinci-003”.
 *
 * See: https://platform.openai.com/docs/models/gpt-3
 */
export type OpenAITextModelNamePropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * The prompt provided as an input to an AI-model capable of generating text.
 *
 * When submitted alongside a specific model, this should conform to the respective constraints of that model.
 *
 * See: https://blockprotocol.org/docs/spec/service-module
 */
export type OpenAITextModelPromptPropertyValue = TextDataValue;
/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataValue;

/**
 * The root entity of the AI [generated] text block.
 *
 * See: https://blockprotocol.org/@hash/blocks/ai-text
 */
export type AITextBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-name/"?: OpenAITextModelNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-prompt/"?: OpenAITextModelPromptPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type AITextBlock = Entity<AITextBlockProperties>;
export type AITextBlockLinksByLinkTypeId = {};

export type AITextBlockLinkAndRightEntities = NonNullable<
  AITextBlockLinksByLinkTypeId[keyof AITextBlockLinksByLinkTypeId]
>;

export type RootEntity = AITextBlock;
export type RootEntityLinkedEntities = AITextBlockLinkAndRightEntities;
export type RootLinkMap = AITextBlockLinksByLinkTypeId;
