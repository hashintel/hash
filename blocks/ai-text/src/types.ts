import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/entity-type/ai-text/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Textual content
 */
export type TextContent = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * The name of a model
 */
export type Model = Text;
/**
 * A textual prompt
 */
export type Prompt = Text;

/**
 * AI-generated text
 */
export type AITextProperties = {
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/text-content/"?: TextContent;
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/model/"?: Model;
  "https://blockprotocol-9a7200lt2.stage.hash.ai/@ciaranm/types/property-type/prompt/"?: Prompt;
};

export type AIText = Entity<AITextProperties>;
export type AITextLinksByLinkTypeId = {};

export type AITextLinkAndRightEntities = NonNullable<
  AITextLinksByLinkTypeId[keyof AITextLinksByLinkTypeId]
>;

export type RootEntity = AIText;
export type RootEntityLinkedEntities = AITextLinkAndRightEntities;
export type RootLinkMap = AITextLinksByLinkTypeId;
