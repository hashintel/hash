/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ArchivedPropertyValue,
  Author,
  AuthorOutgoingLinkAndTarget,
  AuthorOutgoingLinksByLinkEntityTypeId,
  AuthorProperties,
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  Comment,
  CommentAuthorLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentParentLink,
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
  OccurredInPage,
  OccurredInPageOutgoingLinkAndTarget,
  OccurredInPageOutgoingLinksByLinkEntityTypeId,
  OccurredInPageProperties,
  Org,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  OrgHasAvatarLink,
  OrgHasBioLink,
  OrgHasCoverImageLink,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  Page,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageParentLink,
  PageProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
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
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsitePropertyValue,
} from "./shared";

export type {
  ArchivedPropertyValue,
  Author,
  AuthorOutgoingLinkAndTarget,
  AuthorOutgoingLinksByLinkEntityTypeId,
  AuthorProperties,
  Block,
  BlockBlockDataLink,
  BlockCollection,
  BlockCollectionContainsLink,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockData,
  BlockDataOutgoingLinkAndTarget,
  BlockDataOutgoingLinksByLinkEntityTypeId,
  BlockDataProperties,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  Comment,
  CommentAuthorLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentParentLink,
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
  OccurredInPage,
  OccurredInPageOutgoingLinkAndTarget,
  OccurredInPageOutgoingLinksByLinkEntityTypeId,
  OccurredInPageProperties,
  Org,
  OrganizationNamePropertyValue,
  OrganizationProvidedInformationPropertyValue,
  OrganizationSizePropertyValue,
  OrgHasAvatarLink,
  OrgHasBioLink,
  OrgHasCoverImageLink,
  OrgMembership,
  OrgMembershipOutgoingLinkAndTarget,
  OrgMembershipOutgoingLinksByLinkEntityTypeId,
  OrgMembershipProperties,
  OrgOutgoingLinkAndTarget,
  OrgOutgoingLinksByLinkEntityTypeId,
  OrgProperties,
  OriginalFileNamePropertyValue,
  OriginalSourcePropertyValue,
  OriginalURLPropertyValue,
  Page,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageParentLink,
  PageProperties,
  Parent,
  ParentOutgoingLinkAndTarget,
  ParentOutgoingLinksByLinkEntityTypeId,
  ParentProperties,
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
  UserOrgMembershipLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  WebsitePropertyValue,
};

export type MentionNotification = Entity<MentionNotificationProperties>;

export type MentionNotificationOccurredInCommentLink = {
  linkEntity: OccurredInComment;
  rightEntity: Comment;
};

export type MentionNotificationOccurredInPageLink = {
  linkEntity: OccurredInPage;
  rightEntity: Page;
};

export type MentionNotificationOccurredInTextLink = {
  linkEntity: OccurredInText;
  rightEntity: Text;
};

export type MentionNotificationOutgoingLinkAndTarget =
  | MentionNotificationOccurredInCommentLink
  | MentionNotificationOccurredInPageLink
  | MentionNotificationOccurredInTextLink
  | MentionNotificationTriggeredByUserLink;

export type MentionNotificationOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/occurred-in-comment/v/1": MentionNotificationOccurredInCommentLink;
  "http://localhost:3000/@system-user/types/entity-type/occurred-in-page/v/1": MentionNotificationOccurredInPageLink;
  "http://localhost:3000/@system-user/types/entity-type/occurred-in-text/v/1": MentionNotificationOccurredInTextLink;
  "http://localhost:3000/@system-user/types/entity-type/triggered-by-user/v/1": MentionNotificationTriggeredByUserLink;
};

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
