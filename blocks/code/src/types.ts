import { Entity } from "@blockprotocol/graph";

/* eslint-disable */
/**
 * This file was automatically generated – do not edit it.
 * @see https://alpha.hash.ai/@ciaran/types/entity-type/code-snippet/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Textual content
 */
export type Content = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * a language
 */
export type Language = Text;
/**
 * A caption
 */
export type Caption = Text;

/**
 * A snippet of code
 */
export type CodeSnippetProperties = {
  "https://alpha.hash.ai/@ciaran/types/property-type/content/": Content;
  "https://alpha.hash.ai/@ciaran/types/property-type/language/": Language;
  "https://alpha.hash.ai/@ciaran/types/property-type/caption/"?: Caption;
}

export type CodeSnippet = Entity<CodeSnippetProperties>;
export type CodeSnippetLinksByLinkTypeId = {

};

export type CodeSnippetLinkAndRightEntities = NonNullable<
  CodeSnippetLinksByLinkTypeId[keyof CodeSnippetLinksByLinkTypeId]
>;

export type RootEntity = CodeSnippet;
export type RootEntityLinkedEntities = CodeSnippetLinkAndRightEntities;
export type RootLinkMap = CodeSnippetLinksByLinkTypeId;