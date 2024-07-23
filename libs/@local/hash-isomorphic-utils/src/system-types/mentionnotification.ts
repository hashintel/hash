/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  ActorPropertiesWithMetadataValue,
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  AuthoredByPropertiesWithMetadataValue,
  AutomaticInferenceConfigurationPropertyValue,
  AutomaticInferenceConfigurationPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockCollectionPropertiesWithMetadataValue,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BlockPropertiesWithMetadataValue,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  BrowserPluginSettingsPropertiesWithMetadataValue,
  BrowserPluginTabPropertyValue,
  BrowserPluginTabPropertyValueWithMetadata,
  Comment,
  CommentAuthoredByLink,
  CommentHasParentLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentProperties,
  CommentPropertiesWithMetadata,
  CommentPropertiesWithMetadataValue,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DeletedAtPropertyValue,
  DeletedAtPropertyValueWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  DraftNotePropertyValue,
  DraftNotePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  EnabledFeatureFlagsPropertyValue,
  EnabledFeatureFlagsPropertyValueWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
  FilePropertiesWithMetadataValue,
  FileSizePropertyValue,
  FileSizePropertyValueWithMetadata,
  FileStorageBucketPropertyValue,
  FileStorageBucketPropertyValueWithMetadata,
  FileStorageEndpointPropertyValue,
  FileStorageEndpointPropertyValueWithMetadata,
  FileStorageForcePathStylePropertyValue,
  FileStorageForcePathStylePropertyValueWithMetadata,
  FileStorageKeyPropertyValue,
  FileStorageKeyPropertyValueWithMetadata,
  FileStorageProviderPropertyValue,
  FileStorageProviderPropertyValueWithMetadata,
  FileStorageRegionPropertyValue,
  FileStorageRegionPropertyValueWithMetadata,
  FileURLPropertyValue,
  FileURLPropertyValueWithMetadata,
  FractionalIndexPropertyValue,
  FractionalIndexPropertyValueWithMetadata,
  Has,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  HasAvatarPropertiesWithMetadata,
  HasAvatarPropertiesWithMetadataValue,
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasBioPropertiesWithMetadata,
  HasBioPropertiesWithMetadataValue,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasCoverImagePropertiesWithMetadata,
  HasCoverImagePropertiesWithMetadataValue,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasDataPropertiesWithMetadataValue,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasIndexedContentPropertiesWithMetadataValue,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  HasParentPropertiesWithMetadataValue,
  HasProperties,
  HasPropertiesWithMetadata,
  HasPropertiesWithMetadataValue,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  HasServiceAccountPropertiesWithMetadataValue,
  HasText,
  HasTextOutgoingLinkAndTarget,
  HasTextOutgoingLinksByLinkEntityTypeId,
  HasTextProperties,
  HasTextPropertiesWithMetadata,
  HasTextPropertiesWithMetadataValue,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  ImagePropertiesWithMetadata,
  ImagePropertiesWithMetadataValue,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  IsMemberOfPropertiesWithMetadata,
  IsMemberOfPropertiesWithMetadataValue,
  KratosIdentityIdPropertyValue,
  KratosIdentityIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
  ManualInferenceConfigurationPropertyValue,
  ManualInferenceConfigurationPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  NotificationPropertiesWithMetadataValue,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OccurredInBlock,
  OccurredInBlockOutgoingLinkAndTarget,
  OccurredInBlockOutgoingLinksByLinkEntityTypeId,
  OccurredInBlockProperties,
  OccurredInBlockPropertiesWithMetadata,
  OccurredInBlockPropertiesWithMetadataValue,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
  OccurredInEntityPropertiesWithMetadataValue,
  Organization,
  OrganizationHasAvatarLink,
  OrganizationHasBioLink,
  OrganizationHasCoverImageLink,
  OrganizationNamePropertyValue,
  OrganizationNamePropertyValueWithMetadata,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OrganizationPropertiesWithMetadata,
  OrganizationPropertiesWithMetadataValue,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  PagePropertiesWithMetadataValue,
  PinnedEntityTypeBaseURLPropertyValue,
  PinnedEntityTypeBaseURLPropertyValueWithMetadata,
  PreferredPronounsPropertyValue,
  PreferredPronounsPropertyValueWithMetadata,
  ProfileBio,
  ProfileBioHasIndexedContentLink,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileBioPropertiesWithMetadata,
  ProfileBioPropertiesWithMetadataValue,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ReadAtPropertyValue,
  ReadAtPropertyValueWithMetadata,
  ResolvedAtPropertyValue,
  ResolvedAtPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ServiceAccountPropertiesWithMetadataValue,
  ShortnamePropertyValue,
  ShortnamePropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  Text,
  TextDataType,
  TextDataTypeWithMetadata,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TextPropertiesWithMetadata,
  TextPropertiesWithMetadataValue,
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  TriggeredByUser,
  TriggeredByUserOutgoingLinkAndTarget,
  TriggeredByUserOutgoingLinksByLinkEntityTypeId,
  TriggeredByUserProperties,
  TriggeredByUserPropertiesWithMetadata,
  TriggeredByUserPropertiesWithMetadataValue,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserPropertiesWithMetadata,
  UserPropertiesWithMetadataValue,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
} from "./shared.js";

export type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  ActorPropertiesWithMetadataValue,
  ArchivedPropertyValue,
  ArchivedPropertyValueWithMetadata,
  AuthoredBy,
  AuthoredByOutgoingLinkAndTarget,
  AuthoredByOutgoingLinksByLinkEntityTypeId,
  AuthoredByProperties,
  AuthoredByPropertiesWithMetadata,
  AuthoredByPropertiesWithMetadataValue,
  AutomaticInferenceConfigurationPropertyValue,
  AutomaticInferenceConfigurationPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockCollectionPropertiesWithMetadataValue,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BlockPropertiesWithMetadataValue,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  BrowserPluginSettingsPropertiesWithMetadataValue,
  BrowserPluginTabPropertyValue,
  BrowserPluginTabPropertyValueWithMetadata,
  Comment,
  CommentAuthoredByLink,
  CommentHasParentLink,
  CommentHasTextLink,
  CommentOutgoingLinkAndTarget,
  CommentOutgoingLinksByLinkEntityTypeId,
  CommentProperties,
  CommentPropertiesWithMetadata,
  CommentPropertiesWithMetadataValue,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DeletedAtPropertyValue,
  DeletedAtPropertyValueWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  DraftNotePropertyValue,
  DraftNotePropertyValueWithMetadata,
  EmailPropertyValue,
  EmailPropertyValueWithMetadata,
  EnabledFeatureFlagsPropertyValue,
  EnabledFeatureFlagsPropertyValueWithMetadata,
  EntityEditionIdPropertyValue,
  EntityEditionIdPropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
  FilePropertiesWithMetadataValue,
  FileSizePropertyValue,
  FileSizePropertyValueWithMetadata,
  FileStorageBucketPropertyValue,
  FileStorageBucketPropertyValueWithMetadata,
  FileStorageEndpointPropertyValue,
  FileStorageEndpointPropertyValueWithMetadata,
  FileStorageForcePathStylePropertyValue,
  FileStorageForcePathStylePropertyValueWithMetadata,
  FileStorageKeyPropertyValue,
  FileStorageKeyPropertyValueWithMetadata,
  FileStorageProviderPropertyValue,
  FileStorageProviderPropertyValueWithMetadata,
  FileStorageRegionPropertyValue,
  FileStorageRegionPropertyValueWithMetadata,
  FileURLPropertyValue,
  FileURLPropertyValueWithMetadata,
  FractionalIndexPropertyValue,
  FractionalIndexPropertyValueWithMetadata,
  Has,
  HasAvatar,
  HasAvatarOutgoingLinkAndTarget,
  HasAvatarOutgoingLinksByLinkEntityTypeId,
  HasAvatarProperties,
  HasAvatarPropertiesWithMetadata,
  HasAvatarPropertiesWithMetadataValue,
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasBioPropertiesWithMetadata,
  HasBioPropertiesWithMetadataValue,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasCoverImagePropertiesWithMetadata,
  HasCoverImagePropertiesWithMetadataValue,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasDataPropertiesWithMetadataValue,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasIndexedContentPropertiesWithMetadataValue,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasParent,
  HasParentOutgoingLinkAndTarget,
  HasParentOutgoingLinksByLinkEntityTypeId,
  HasParentProperties,
  HasParentPropertiesWithMetadata,
  HasParentPropertiesWithMetadataValue,
  HasProperties,
  HasPropertiesWithMetadata,
  HasPropertiesWithMetadataValue,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  HasServiceAccountPropertiesWithMetadataValue,
  HasText,
  HasTextOutgoingLinkAndTarget,
  HasTextOutgoingLinksByLinkEntityTypeId,
  HasTextProperties,
  HasTextPropertiesWithMetadata,
  HasTextPropertiesWithMetadataValue,
  IconPropertyValue,
  IconPropertyValueWithMetadata,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  ImagePropertiesWithMetadata,
  ImagePropertiesWithMetadataValue,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  IsMemberOfPropertiesWithMetadata,
  IsMemberOfPropertiesWithMetadataValue,
  KratosIdentityIdPropertyValue,
  KratosIdentityIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
  ManualInferenceConfigurationPropertyValue,
  ManualInferenceConfigurationPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  Notification,
  NotificationOutgoingLinkAndTarget,
  NotificationOutgoingLinksByLinkEntityTypeId,
  NotificationProperties,
  NotificationPropertiesWithMetadata,
  NotificationPropertiesWithMetadataValue,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OccurredInBlock,
  OccurredInBlockOutgoingLinkAndTarget,
  OccurredInBlockOutgoingLinksByLinkEntityTypeId,
  OccurredInBlockProperties,
  OccurredInBlockPropertiesWithMetadata,
  OccurredInBlockPropertiesWithMetadataValue,
  OccurredInEntity,
  OccurredInEntityOutgoingLinkAndTarget,
  OccurredInEntityOutgoingLinksByLinkEntityTypeId,
  OccurredInEntityProperties,
  OccurredInEntityPropertiesWithMetadata,
  OccurredInEntityPropertiesWithMetadataValue,
  Organization,
  OrganizationHasAvatarLink,
  OrganizationHasBioLink,
  OrganizationHasCoverImageLink,
  OrganizationNamePropertyValue,
  OrganizationNamePropertyValueWithMetadata,
  OrganizationOutgoingLinkAndTarget,
  OrganizationOutgoingLinksByLinkEntityTypeId,
  OrganizationProperties,
  OrganizationPropertiesWithMetadata,
  OrganizationPropertiesWithMetadataValue,
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
  Page,
  PageHasParentLink,
  PageOutgoingLinkAndTarget,
  PageOutgoingLinksByLinkEntityTypeId,
  PageProperties,
  PagePropertiesWithMetadata,
  PagePropertiesWithMetadataValue,
  PinnedEntityTypeBaseURLPropertyValue,
  PinnedEntityTypeBaseURLPropertyValueWithMetadata,
  PreferredPronounsPropertyValue,
  PreferredPronounsPropertyValueWithMetadata,
  ProfileBio,
  ProfileBioHasIndexedContentLink,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileBioPropertiesWithMetadata,
  ProfileBioPropertiesWithMetadataValue,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ReadAtPropertyValue,
  ReadAtPropertyValueWithMetadata,
  ResolvedAtPropertyValue,
  ResolvedAtPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ServiceAccountPropertiesWithMetadataValue,
  ShortnamePropertyValue,
  ShortnamePropertyValueWithMetadata,
  SummaryPropertyValue,
  SummaryPropertyValueWithMetadata,
  Text,
  TextDataType,
  TextDataTypeWithMetadata,
  TextOutgoingLinkAndTarget,
  TextOutgoingLinksByLinkEntityTypeId,
  TextProperties,
  TextPropertiesWithMetadata,
  TextPropertiesWithMetadataValue,
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
  TriggeredByUser,
  TriggeredByUserOutgoingLinkAndTarget,
  TriggeredByUserOutgoingLinksByLinkEntityTypeId,
  TriggeredByUserProperties,
  TriggeredByUserPropertiesWithMetadata,
  TriggeredByUserPropertiesWithMetadataValue,
  UploadCompletedAtPropertyValue,
  UploadCompletedAtPropertyValueWithMetadata,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserPropertiesWithMetadata,
  UserPropertiesWithMetadataValue,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
};

/**
 * A notification that a user was mentioned somewhere.
 */
export interface MentionNotification {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/mention-notification/v/5";
  properties: MentionNotificationProperties;
  propertiesWithMetadata: MentionNotificationPropertiesWithMetadata;
}

export interface MentionNotificationOccurredInBlockLink {
  linkEntity: OccurredInBlock;
  rightEntity: Block;
}

export interface MentionNotificationOccurredInCommentLink {
  linkEntity: OccurredInComment;
  rightEntity: Comment;
}

export interface MentionNotificationOccurredInEntityLink {
  linkEntity: OccurredInEntity;
  rightEntity: Page;
}

export interface MentionNotificationOccurredInTextLink {
  linkEntity: OccurredInText;
  rightEntity: Text;
}

export type MentionNotificationOutgoingLinkAndTarget =
  | MentionNotificationOccurredInBlockLink
  | MentionNotificationOccurredInCommentLink
  | MentionNotificationOccurredInEntityLink
  | MentionNotificationOccurredInTextLink
  | MentionNotificationTriggeredByUserLink;

export interface MentionNotificationOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1": MentionNotificationOccurredInBlockLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1": MentionNotificationOccurredInCommentLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2": MentionNotificationOccurredInEntityLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1": MentionNotificationOccurredInTextLink;
  "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1": MentionNotificationTriggeredByUserLink;
}

/**
 * A notification that a user was mentioned somewhere.
 */
export interface MentionNotificationProperties
  extends MentionNotificationProperties1,
    MentionNotificationProperties2 {}
export interface MentionNotificationProperties1
  extends NotificationProperties {}

export interface MentionNotificationProperties2 {}

export interface MentionNotificationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: MentionNotificationPropertiesWithMetadataValue;
}

export interface MentionNotificationPropertiesWithMetadataValue
  extends MentionNotificationPropertiesWithMetadataValue1,
    MentionNotificationPropertiesWithMetadataValue2 {}
export interface MentionNotificationPropertiesWithMetadataValue1
  extends NotificationPropertiesWithMetadataValue {}

export interface MentionNotificationPropertiesWithMetadataValue2 {}

export interface MentionNotificationTriggeredByUserLink {
  linkEntity: TriggeredByUser;
  rightEntity: User;
}

/**
 * A comment that something occurred in.
 */
export interface OccurredInComment {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/occurred-in-comment/v/1";
  properties: OccurredInCommentProperties;
  propertiesWithMetadata: OccurredInCommentPropertiesWithMetadata;
}

export type OccurredInCommentOutgoingLinkAndTarget = never;

export interface OccurredInCommentOutgoingLinksByLinkEntityTypeId {}

/**
 * A comment that something occurred in.
 */
export interface OccurredInCommentProperties
  extends OccurredInCommentProperties1,
    OccurredInCommentProperties2 {}
export interface OccurredInCommentProperties1 extends LinkProperties {}

export interface OccurredInCommentProperties2 {}

export interface OccurredInCommentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: OccurredInCommentPropertiesWithMetadataValue;
}

export interface OccurredInCommentPropertiesWithMetadataValue
  extends OccurredInCommentPropertiesWithMetadataValue1,
    OccurredInCommentPropertiesWithMetadataValue2 {}
export interface OccurredInCommentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface OccurredInCommentPropertiesWithMetadataValue2 {}

/**
 * Text that something occurred in.
 */
export interface OccurredInText {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/occurred-in-text/v/1";
  properties: OccurredInTextProperties;
  propertiesWithMetadata: OccurredInTextPropertiesWithMetadata;
}

export type OccurredInTextOutgoingLinkAndTarget = never;

export interface OccurredInTextOutgoingLinksByLinkEntityTypeId {}

/**
 * Text that something occurred in.
 */
export interface OccurredInTextProperties
  extends OccurredInTextProperties1,
    OccurredInTextProperties2 {}
export interface OccurredInTextProperties1 extends LinkProperties {}

export interface OccurredInTextProperties2 {}

export interface OccurredInTextPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: OccurredInTextPropertiesWithMetadataValue;
}

export interface OccurredInTextPropertiesWithMetadataValue
  extends OccurredInTextPropertiesWithMetadataValue1,
    OccurredInTextPropertiesWithMetadataValue2 {}
export interface OccurredInTextPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface OccurredInTextPropertiesWithMetadataValue2 {}
