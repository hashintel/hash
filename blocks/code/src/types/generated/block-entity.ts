/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

export type BlockEntity = CodeBlock;

export type BlockEntityOutgoingLinkAndTarget = CodeBlockOutgoingLinkAndTarget;

/**
 * A brief explanation or accompanying message.
 */
export type CaptionPropertyValue = Text;

export type CodeBlock = Entity<CodeBlockProperties>;

/**
 * A description of the language the code is written in.
 *
 * This should conform to one of the languages supported by Prism, for example "javascript".
 *
 * See: https://prismjs.com/#supported-languages
 */
export type CodeBlockLanguagePropertyValue = Text;

export type CodeBlockOutgoingLinkAndTarget = never;

export type CodeBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * The block entity of the “Code” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/code
 */
export type CodeBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/caption/"?: CaptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
  "https://blockprotocol.org/@hash/types/property-type/code-block-language/"?: CodeBlockLanguagePropertyValue;
};

/**
 * An ordered sequence of characters
 */
export type Text = string;

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = Text;
