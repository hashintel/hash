/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type AIImageBlock = Entity<AIImageBlockProperties>;

export type AIImageBlockGeneratedLink = {
  linkEntity: Generated;
  rightEntity: Image;
};

export type AIImageBlockOutgoingLinkAndTarget = AIImageBlockGeneratedLink;

export type AIImageBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1": AIImageBlockGeneratedLink;
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
 * A True or False value
 */
export type BooleanDataType = boolean;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export type File = Entity<FileProperties>;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file hosted at a URL
 */
export type FileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type Generated = Entity<GeneratedProperties> & { linkData: LinkData };

export type GeneratedOutgoingLinkAndTarget = never;

export type GeneratedOutgoingLinksByLinkEntityTypeId = {};

/**
 * Generated, created, or produced, this thing.
 */
export type GeneratedProperties = GeneratedProperties1 & GeneratedProperties2;
export type GeneratedProperties1 = LinkProperties;

export type GeneratedProperties2 = {};

export type Image = Entity<ImageProperties>;

export type ImageOutgoingLinkAndTarget = never;

export type ImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageProperties = ImageProperties1 & ImageProperties2;
export type ImageProperties1 = FileProperties;

export type ImageProperties2 = {};

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * The prompt provided as an input to an OpenAI-model capable of generating images.
 *
 * See: https://blockprotocol.org/docs/spec/service-module
 */
export type OpenAIImageModelPromptPropertyValue = TextDataType;

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;
