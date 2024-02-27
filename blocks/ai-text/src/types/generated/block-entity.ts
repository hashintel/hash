/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type AITextBlock = Entity<AITextBlockProperties>;

export type AITextBlockOutgoingLinkAndTarget = never;

export type AITextBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity of the AI [generated] text block.
 *
 * See: https://blockprotocol.org/@hash/blocks/ai-text
 */
export type AITextBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-name/"?: OpenAITextModelNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-text-model-prompt/"?: OpenAITextModelPromptPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type BlockEntity = AITextBlock;

export type BlockEntityOutgoingLinkAndTarget = AITextBlockOutgoingLinkAndTarget;

/**
 * The name of an OpenAI model supported by the Block Protocol service module, which is capable of producing text outputs.
 *
 * This should match the strings within the GPT-3 section of the OpenAI docs, for example: “text-davinci-003”.
 *
 * See: https://platform.openai.com/docs/models/gpt-3
 */
export type OpenAITextModelNamePropertyValue = TextDataType;

/**
 * The prompt provided as an input to an OpenAI-model capable of generating text.
 *
 * When submitted alongside a specific model, this should conform to the respective constraints of that model.
 *
 * See: https://blockprotocol.org/docs/spec/service-module
 */
export type OpenAITextModelPromptPropertyValue = TextDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType;
