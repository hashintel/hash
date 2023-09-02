/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  Block,
  BlockBlockDataLink,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  ComponentIdPropertyValue,
  Description0PropertyValue,
  Description1PropertyValue,
  EmailPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  ObjectDataType,
  Org,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  OrgHasAvatarLink,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  PreferredNamePropertyValue,
  RemoteFile,
  RemoteFileOutgoingLinkAndTarget,
  RemoteFileOutgoingLinksByLinkEntityTypeId,
  RemoteFileProperties,
  RemoteImageFile,
  RemoteImageFileOutgoingLinkAndTarget,
  RemoteImageFileOutgoingLinksByLinkEntityTypeId,
  RemoteImageFileProperties,
  ShortnamePropertyValue,
  Text,
  TextDataType,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TokensPropertyValue,
  User,
  UserHasAvatarLink,
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsitePropertyValue,
} from "./shared";

export type {
  Block,
  BlockBlockDataLink,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  ComponentIdPropertyValue,
  Description0PropertyValue,
  Description1PropertyValue,
  EmailPropertyValue,
  FileNamePropertyValue,
  FileURLPropertyValue,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  ObjectDataType,
  Org,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  OrgHasAvatarLink,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
  PreferredNamePropertyValue,
  RemoteFile,
  RemoteFileOutgoingLinkAndTarget,
  RemoteFileOutgoingLinksByLinkEntityTypeId,
  RemoteFileProperties,
  RemoteImageFile,
  RemoteImageFileOutgoingLinkAndTarget,
  RemoteImageFileOutgoingLinksByLinkEntityTypeId,
  RemoteImageFileProperties,
  ShortnamePropertyValue,
  Text,
  TextDataType,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TokensPropertyValue,
  User,
  UserHasAvatarLink,
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsitePropertyValue,
};

export type Author = Entity<AuthorProperties> & { linkData: LinkData };

export type AuthorOutgoingLinkAndTarget = never;

export type AuthorOutgoingLinksByLinkEntityTypeId = {};

/**
 * The author of something.
 */
export type AuthorProperties = AuthorProperties1 & AuthorProperties2;
export type AuthorProperties1 = LinkProperties;

export type AuthorProperties2 = {};

export type Comment = Entity<CommentProperties>;

export type CommentAuthorLink = { linkEntity: Author; rightEntity: User };

export type CommentHasTextLink = { linkEntity: HasText; rightEntity: Text };

export type CommentOutgoingLinkAndTarget =
  | CommentAuthorLink
  | CommentHasTextLink
  | CommentParentLink;

export type CommentOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/author/v/1": CommentAuthorLink;
  "http://localhost:3000/@system-user/types/entity-type/has-text/v/1": CommentHasTextLink;
  "http://localhost:3000/@system-user/types/entity-type/parent/v/1": CommentParentLink;
};

export type CommentParentLink = {
  linkEntity: Parent;
  rightEntity: Comment | Block;
};

export type CommentProperties = {
  "http://localhost:3000/@system-user/types/property-type/deleted-at/"?: DeletedAtPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/resolved-at/"?: ResolvedAtPropertyValue;
};

/**
 * Stringified timestamp of when something was deleted.
 */
export type DeletedAtPropertyValue = TextDataType;

export type HasText = Entity<HasTextProperties> & { linkData: LinkData };

export type HasTextOutgoingLinkAndTarget = never;

export type HasTextOutgoingLinksByLinkEntityTypeId = {};

/**
 * The text something has.
 */
export type HasTextProperties = HasTextProperties1 & HasTextProperties2;
export type HasTextProperties1 = LinkProperties;

export type HasTextProperties2 = {};

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = TextDataType;
