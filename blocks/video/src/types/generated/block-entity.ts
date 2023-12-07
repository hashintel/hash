/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = VideoBlock;

export type BlockEntityOutgoingLinkAndTarget = VideoBlockOutgoingLinkAndTarget;

/**
 * A True or False value
 */
export type Boolean = boolean;

/**
 * A brief explanation or accompanying message.
 */
export type CaptionPropertyValue = Text;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = Text;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = Text;

export type DisplaysMediaFile = Entity<DisplaysMediaFileProperties> & {
  linkData: LinkData;
};

export type DisplaysMediaFileOutgoingLinkAndTarget = never;

export type DisplaysMediaFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Displays this media file.
 */
export type DisplaysMediaFileProperties = DisplaysMediaFileProperties1 &
  DisplaysMediaFileProperties2;
export type DisplaysMediaFileProperties1 = LinkProperties;

export type DisplaysMediaFileProperties2 = {};

export type File = Entity<FileProperties>;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = Text;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = Text;

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
  "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = Number;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = Text;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = Text;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = Boolean;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = Text;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = Text;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = Text;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = Text;

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
export type MIMETypePropertyValue = Text;

/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = Text;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = Text;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = Text;

/**
 * An ordered sequence of characters
 */
export type Text = string;

export type VideoBlock = Entity<VideoBlockProperties>;

export type VideoBlockDisplaysMediaFileLink = {
  linkEntity: DisplaysMediaFile;
  rightEntity: Image;
};

export type VideoBlockOutgoingLinkAndTarget = VideoBlockDisplaysMediaFileLink;

export type VideoBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1": VideoBlockDisplaysMediaFileLink;
};

/**
 * The block entity for the “Video” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/video
 */
export type VideoBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/caption/"?: CaptionPropertyValue;
};
