/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ArchivedPropertyValue,
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
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
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
  HasAction,
  HasActionOutgoingLinkAndTarget,
  HasActionOutgoingLinksByLinkEntityTypeId,
  HasActionProperties,
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
  IconPropertyValue,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  IndexPropertyValue,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  Notification,
  NotificationAction,
  NotificationActionOutgoingLinkAndTarget,
  NotificationActionOutgoingLinksByLinkEntityTypeId,
  NotificationActionProperties,
  NotificationHasActionLink,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NumberDataType,
  ObjectDataType,
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
  TitlePropertyValue,
  TokensPropertyValue,
  URLPropertyValue,
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
  ComponentIdPropertyValue,
  Contains,
  ContainsOutgoingLinkAndTarget,
  ContainsOutgoingLinksByLinkEntityTypeId,
  ContainsProperties,
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
  HasAction,
  HasActionOutgoingLinkAndTarget,
  HasActionOutgoingLinksByLinkEntityTypeId,
  HasActionProperties,
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
  IconPropertyValue,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  IndexPropertyValue,
  KratosIdentityIdPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LocationPropertyValue,
  MIMETypePropertyValue,
  Notification,
  NotificationAction,
  NotificationActionOutgoingLinkAndTarget,
  NotificationActionOutgoingLinksByLinkEntityTypeId,
  NotificationActionProperties,
  NotificationHasActionLink,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NumberDataType,
  ObjectDataType,
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
  TitlePropertyValue,
  TokensPropertyValue,
  URLPropertyValue,
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

export type OccurredInPage = Entity<OccurredInPageProperties> & {
  linkData: LinkData;
};

export type OccurredInPageOutgoingLinkAndTarget = never;

export type OccurredInPageOutgoingLinksByLinkEntityTypeId = {};

/**
 * A page that something occurred in.
 */
export type OccurredInPageProperties = OccurredInPageProperties1 &
  OccurredInPageProperties2;
export type OccurredInPageProperties1 = LinkProperties;

export type OccurredInPageProperties2 = {};

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

export type PageMentionNotification = Entity<PageMentionNotificationProperties>;

export type PageMentionNotificationOccurredInPageLink = {
  linkEntity: OccurredInPage;
  rightEntity: Page;
};

export type PageMentionNotificationOccurredInTextLink = {
  linkEntity: OccurredInText;
  rightEntity: Text;
};

export type PageMentionNotificationOutgoingLinkAndTarget =
  | PageMentionNotificationOccurredInPageLink
  | PageMentionNotificationOccurredInTextLink
  | PageMentionNotificationTriggeredByUserLink;

export type PageMentionNotificationOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/occurred-in-page/v/1": PageMentionNotificationOccurredInPageLink;
  "http://localhost:3000/@system-user/types/entity-type/occurred-in-text/v/1": PageMentionNotificationOccurredInTextLink;
  "http://localhost:3000/@system-user/types/entity-type/triggered-by-user/v/1": PageMentionNotificationTriggeredByUserLink;
};

export type PageMentionNotificationProperties =
  PageMentionNotificationProperties1 & PageMentionNotificationProperties2;
export type PageMentionNotificationProperties1 = NotificationProperties;

export type PageMentionNotificationProperties2 = {};

export type PageMentionNotificationTriggeredByUserLink = {
  linkEntity: TriggeredByUser;
  rightEntity: User;
};

export type TriggeredByUser = Entity<TriggeredByUserProperties> & {
  linkData: LinkData;
};

export type TriggeredByUserOutgoingLinkAndTarget = never;

export type TriggeredByUserOutgoingLinksByLinkEntityTypeId = {};

/**
 * A user that triggered something.
 */
export type TriggeredByUserProperties = TriggeredByUserProperties1 &
  TriggeredByUserProperties2;
export type TriggeredByUserProperties1 = LinkProperties;

export type TriggeredByUserProperties2 = {};
