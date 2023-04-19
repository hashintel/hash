/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type BlockEntity = VideoBlock;

export type BlockEntityOutgoingLinkAndTarget = VideoBlockOutgoingLinkAndTarget;

/**
 * A brief explanation or accompanying message.
 */
export type CaptionPropertyValue = Text;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = Text;

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

/**
 * The name of a file.
 */
export type FileNamePropertyValue = Text;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = Text;

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

export type VideoBlock = Entity<VideoBlockProperties>;

export type VideoBlockDisplaysMediaFileLinks = {
  linkEntity: DisplaysMediaFile;
  rightEntity: RemoteFile;
};

export type VideoBlockOutgoingLinkAndTarget = VideoBlockDisplaysMediaFileLinks;

export type VideoBlockOutgoingLinksByLinkEntityTypeId = {
  "https://blockprotocol.org/@hash/types/entity-type/displays-media-file/v/1": VideoBlockDisplaysMediaFileLinks;
};

/**
 * The block entity for the “Video” block.
 *
 * See: https://blockprotocol.org/@hash/blocks/video
 */
export type VideoBlockProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/caption/"?: CaptionPropertyValue;
};
