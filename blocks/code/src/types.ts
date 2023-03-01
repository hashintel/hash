import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/code-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * A brief explanation or accompanying message.
 */
export type CaptionPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;
/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataValue;
/**
 * A description of the language the code is written in.
 *
 * This should conform to one of the languages supported by Prism, for example "javascript".
 *
 * See: https://prismjs.com/#supported-languages
 */
export type CodeBlockLanguagePropertyValue = TextDataValue;

/**
 * The root entity of the “Code” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/code
 */
export type CodeBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/caption/"?: CaptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/code-block-language/"?: CodeBlockLanguagePropertyValue;
};

export type CodeBlock = Entity<CodeBlockProperties>;
export type CodeBlockLinksByLinkTypeId = {};

export type CodeBlockLinkAndRightEntities = NonNullable<
  CodeBlockLinksByLinkTypeId[keyof CodeBlockLinksByLinkTypeId]
>;

export type RootEntity = CodeBlock;
export type RootEntityLinkedEntities = CodeBlockLinkAndRightEntities;
export type RootLinkMap = CodeBlockLinksByLinkTypeId;
