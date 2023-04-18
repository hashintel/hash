/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type AIImageBlock = Entity<AIImageBlockProperties>;

export type AIImageBlockGeneratedLinks = {
  linkEntity: Generated;
  rightEntity: RemoteFile;
};

export type AIImageBlockOutgoingLinkAndTarget = AIImageBlockGeneratedLinks;

export type AIImageBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1": AIImageBlockGeneratedLinks;
};

/**
 * The block entity of the AI [generated] image block.
 *
 * See: https://blockprotocol.org/@hash/blocks/ai-image
 */
export type AIImageBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/openai-image-model-prompt/"?: OpenAIImageModelPromptPropertyValue;
};

export type BlockEntity = AIImageBlock;

export type BlockEntityOutgoingLinkAndTarget =
  AIImageBlockOutgoingLinkAndTarget;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = Text;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = Text;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = Text;

export type Generated = Entity<GeneratedProperties> & { linkData: LinkData };

export type GeneratedOutgoingLinkAndTarget = never;

export type GeneratedOutgoingLinksByLinkEntityTypeId = {};

/**
 * Generated, created, or produced, this thing.
 */
export type GeneratedProperties = GeneratedProperties1 & GeneratedProperties2;
export type GeneratedProperties1 = LinkProperties;

export type GeneratedProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = Text;

/**
 * The prompt provided as an input to an OpenAI-model capable of generating images.
 *
 * See: https://blockprotocol.org/docs/spec/service-module
 */
export type OpenAIImageModelPromptPropertyValue = Text;

export type RemoteFile = Entity<RemoteFileProperties>;

export type RemoteFileOutgoingLinkAndTarget = never;

export type RemoteFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/": MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/": FileNamePropertyValue;
};

/**
 * An ordered sequence of characters
 */
export type Text = string;
