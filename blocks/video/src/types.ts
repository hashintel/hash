import { Entity } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol.org/@hash/types/entity-type/video-block/v/2 for the root JSON Schema these types were generated from
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
 * The block entity for the “Video” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/video
 */
export type VideoBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/caption/"?: CaptionPropertyValue;
};

export type VideoBlock = Entity<VideoBlockProperties>;

/**
 * Displays this media file.
 */
export type DisplaysMediaFileProperties = {};

export type DisplaysMediaFile = Entity<DisplaysMediaFileProperties>;
export type DisplaysMediaFileLinksByLinkTypeId = {};

export type DisplaysMediaFileLinkAndRightEntities = NonNullable<
  DisplaysMediaFileLinksByLinkTypeId[keyof DisplaysMediaFileLinksByLinkTypeId]
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
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
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
export type VideoBlockDisplaysMediaFileLinks =
  | []
  | {
      linkEntity: DisplaysMediaFile;
      rightEntity: RemoteFile;
    }[];

export type VideoBlockLinksByLinkTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1": VideoBlockDisplaysMediaFileLinks;
};

export type VideoBlockLinkAndRightEntities = NonNullable<
  VideoBlockLinksByLinkTypeId[keyof VideoBlockLinksByLinkTypeId]
>;

export type RootEntity = VideoBlock;
export type RootEntityLinkedEntities = VideoBlockLinkAndRightEntities;
export type RootLinkMap = VideoBlockLinksByLinkTypeId;
