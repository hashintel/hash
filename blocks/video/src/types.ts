import { Entity, JsonObject } from "@blockprotocol/graph";

/**
 * This file was automatically generated – do not edit it.
 * @see https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/entity-type/media/v/4 for the root JSON Schema these types were generated from
 * Types for link entities and their destination were generated to a depth of 2 from the root
 */

/**
 * Whether the entity is an image or video
 */
export type MediaType = Text;
/**
 * An ordered sequence of characters
 */
export type Text = string;
/**
 * A textual description of something
 */
export type Caption = Text;
/**
 * Width (in pixels)
 */
export type Width = Number;
/**
 * An arithmetical value (in the Real number system)
 */
export type Number = number;
/**
 * The location where an entity can be found online
 */
export type URL = Text;

/**
 * Image or video
 */
export type MediaProperties = {
  "https://blockprotocol-pktjfgq1m.stage.hash.ai/@blockprotocol/types/property-type/caption/"?: Caption;
};

export type Media = Entity<MediaProperties>;

/**
 * The file an entity describes
 */
export type FileProperties = FileProperties1 & FileProperties2;
export type FileProperties1 = Link;

export type Link = {
  leftEntityId?: string;
  rightEntityId?: string;
};
export type FileProperties2 = {};

export type File = Entity<FileProperties>;
export type FileLinksByLinkTypeId = {};

export type FileLinkAndRightEntities = NonNullable<
  FileLinksByLinkTypeId[keyof FileLinksByLinkTypeId]
>;
export type MediaFileLinks =
  | []
  | {
      linkEntity: File;
      rightEntity: Entity;
    }[];

export type MediaLinksByLinkTypeId = {
  "https://blockprotocol-g5unaez7e.stage.hash.ai/@nate/types/entity-type/file/v/1": MediaFileLinks;
};

export type MediaLinkAndRightEntities = NonNullable<
  MediaLinksByLinkTypeId[keyof MediaLinksByLinkTypeId]
>;

export type RootEntity = Media;
export type RootEntityLinkedEntities = MediaLinkAndRightEntities;
export type RootLinkMap = MediaLinksByLinkTypeId;
