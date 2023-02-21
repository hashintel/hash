import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/entity-type/code-snippet/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * A language (human or programming)
 */
export type Language = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * A textual description of something
 */
export type Caption = Text;
/**
 * Textual content
 */
export type Content = Text;

export type CodeSnippetProperties = {
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/language/": Language;
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/caption/"?: Caption;
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/content/": Content;
};

export type CodeSnippet = Entity<CodeSnippetProperties>;
export type CodeSnippetLinksByLinkTypeId = {};

export type CodeSnippetLinkAndRightEntities = NonNullable<
  CodeSnippetLinksByLinkTypeId[keyof CodeSnippetLinksByLinkTypeId]
>;

export type RootEntity = CodeSnippet;
export type RootEntityLinkedEntities = CodeSnippetLinkAndRightEntities;
export type RootLinkMap = CodeSnippetLinksByLinkTypeId;
