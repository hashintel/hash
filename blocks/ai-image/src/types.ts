import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/ai-image-block/v/2 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * The prompt provided as an input to an AI-model capable of generating images.
 *
 * See: https://blockprotocol.org/docs/spec/service-module
 */
export type OpenAIImageModelPromptPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */
export type TextDataValue = string;

/**
 * TODO
 */
export type AIImageBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-image-model-prompt/"?: OpenAIImageModelPromptPropertyValue;
};

export type AIImageBlock = Entity<AIImageBlockProperties>;

/**
 * Generated, created, or produced, this thing.
 */
export type GeneratedProperties = {};

export type Generated = Entity<GeneratedProperties>;
export type GeneratedLinksByLinkTypeId = {};

export type GeneratedLinkAndRightEntities = NonNullable<
  GeneratedLinksByLinkTypeId[keyof GeneratedLinksByLinkTypeId]
>;
/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataValue;
/**
 * An ordered sequence of characters
 */

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataValue;
/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types.
 */
export type MIMETypePropertyValue = TextDataValue;
/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataValue;

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/": MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/": FileNamePropertyValue;
};

export type RemoteFile = Entity<RemoteFileProperties>;
export type RemoteFileLinksByLinkTypeId = {};

export type RemoteFileLinkAndRightEntities = NonNullable<
  RemoteFileLinksByLinkTypeId[keyof RemoteFileLinksByLinkTypeId]
>;
export type AIImageBlockGeneratedLinks =
  | []
  | {
      linkEntity: Generated;
      rightEntity: RemoteFile;
    }[];

export type AIImageBlockLinksByLinkTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1": AIImageBlockGeneratedLinks;
};

export type AIImageBlockLinkAndRightEntities = NonNullable<
  AIImageBlockLinksByLinkTypeId[keyof AIImageBlockLinksByLinkTypeId]
>;

export type RootEntity = AIImageBlock;
export type RootEntityLinkedEntities = AIImageBlockLinkAndRightEntities;
export type RootLinkMap = AIImageBlockLinksByLinkTypeId;
