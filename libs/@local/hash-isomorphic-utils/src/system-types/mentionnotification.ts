/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ArchivedPropertyValue,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  Block,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  Comment,
  CommentAuthoredByLink,
  CommentHasParentLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentProperties,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  DeletedAtPropertyValue,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FractionalIndexPropertyValue,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasText,
  HasTextOutgoingLinkAndTarget,
  HasTextOutgoingLinksByLinkEntityTypeId,
  HasTextProperties,
  IconPropertyValue,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NumberDataType,
  NumericIndexPropertyValue,
  ObjectDataType,
  OccurredInBlock,
  OccurredInBlockOutgoingLinkAndTarget,
  OccurredInBlockOutgoingLinksByLinkEntityTypeId,
  OccurredInBlockProperties,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  Organization,
  OrganizationHasAvatarLink,
  OrganizationHasBioLink,
  OrganizationHasCoverImageLink,
  OrganizationNamePropertyValue,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PinnedEntityTypeBaseURLPropertyValue,
  PreferredNamePropertyValue,
  PreferredPronounsPropertyValue,
  ProfileBio,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileURLPropertyValue,
  ReadAtPropertyValue,
  ResolvedAtPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ShortnamePropertyValue,
  SummaryPropertyValue,
  Text,
  TextDataType,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TextualContentPropertyValue,
  TitlePropertyValue,
  TriggeredByUser,
  TriggeredByUserOutgoingLinkAndTarget,
  TriggeredByUserOutgoingLinksByLinkEntityTypeId,
  TriggeredByUserProperties,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsiteURLPropertyValue,
} from "./shared";

export type {
  ArchivedPropertyValue,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  Block,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  Comment,
  CommentAuthoredByLink,
  CommentHasParentLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentProperties,
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
  DeletedAtPropertyValue,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  EmailPropertyValue,
  File,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FractionalIndexPropertyValue,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasText,
  HasTextOutgoingLinkAndTarget,
  HasTextOutgoingLinksByLinkEntityTypeId,
  HasTextProperties,
  IconPropertyValue,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NumberDataType,
  NumericIndexPropertyValue,
  ObjectDataType,
  OccurredInBlock,
  OccurredInBlockOutgoingLinkAndTarget,
  OccurredInBlockOutgoingLinksByLinkEntityTypeId,
  OccurredInBlockProperties,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  Organization,
  OrganizationHasAvatarLink,
  OrganizationHasBioLink,
  OrganizationHasCoverImageLink,
  OrganizationNamePropertyValue,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PinnedEntityTypeBaseURLPropertyValue,
  PreferredNamePropertyValue,
  PreferredPronounsPropertyValue,
  ProfileBio,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileURLPropertyValue,
  ReadAtPropertyValue,
  ResolvedAtPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ShortnamePropertyValue,
  SummaryPropertyValue,
  Text,
  TextDataType,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TextualContentPropertyValue,
  TitlePropertyValue,
  TriggeredByUser,
  TriggeredByUserOutgoingLinkAndTarget,
  TriggeredByUserOutgoingLinksByLinkEntityTypeId,
  TriggeredByUserProperties,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsiteURLPropertyValue,
};

export type MentionNotification = Entity<MentionNotificationProperties>;

export type MentionNotificationOccurredInBlockLink = {
  linkEntity: OccurredInBlock;
  rightEntity: Block;
};

export type MentionNotificationOccurredInCommentLink = {
  linkEntity: OccurredInComment;
  rightEntity: Comment;
};

export type MentionNotificationOccurredInEntityLink = {
  linkEntity: OccurredInEntity;
  rightEntity: Page;
};

export type MentionNotificationOccurredInTextLink = {
  linkEntity: OccurredInText;
  rightEntity: Text;
};

export type MentionNotificationOutgoingLinkAndTarget =
  | MentionNotificationOccurredInBlockLink
  | MentionNotificationOccurredInCommentLink
  | MentionNotificationOccurredInEntityLink
  | MentionNotificationOccurredInTextLink
  | MentionNotificationTriggeredByUserLink;

export type MentionNotificationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1": MentionNotificationOccurredInBlockLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1": MentionNotificationOccurredInCommentLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/1": MentionNotificationOccurredInEntityLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1": MentionNotificationOccurredInTextLink;
  "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1": MentionNotificationTriggeredByUserLink;
};

/**
 * A notification that a user was mentioned somewhere.
 */
export type MentionNotificationProperties = MentionNotificationProperties1 &
  MentionNotificationProperties2;
export type MentionNotificationProperties1 = NotificationProperties;

export type MentionNotificationProperties2 = {};

export type MentionNotificationTriggeredByUserLink = {
  linkEntity: TriggeredByUser;
  rightEntity: User;
};

export type OccurredInComment = Entity<OccurredInCommentProperties> & {
  linkData: LinkData;
};

export type OccurredInCommentOutgoingLinkAndTarget = never;

export type OccurredInCommentOutgoingLinksByLinkEntityTypeId = {};

/**
 * A comment that something occurred in.
 */
export type OccurredInCommentProperties = OccurredInCommentProperties1 &
  OccurredInCommentProperties2;
export type OccurredInCommentProperties1 = LinkProperties;

export type OccurredInCommentProperties2 = {};

export type OccurredInText = Entity<OccurredInTextProperties> & {
  linkData: LinkData;
};

export type OccurredInTextOutgoingLinkAndTarget = never;

export type OccurredInTextOutgoingLinksByLinkEntityTypeId = {};

/**
 * Text that something occurred in.
 */
export type OccurredInTextProperties = OccurredInTextProperties1 &
  OccurredInTextProperties2;
export type OccurredInTextProperties1 = LinkProperties;

export type OccurredInTextProperties2 = {};
