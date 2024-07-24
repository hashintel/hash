/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";

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
 * A notification related to a comment.
 */
export interface CommentNotification extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/comment-notification/v/5";
  properties: CommentNotificationProperties;
  propertiesWithMetadata: CommentNotificationPropertiesWithMetadata;
}

export interface CommentNotificationOccurredInBlockLink {
  linkEntity: OccurredInBlock;
  rightEntity: Block;
}

export interface CommentNotificationOccurredInEntityLink {
  linkEntity: OccurredInEntity;
  rightEntity: Page;
}

export type CommentNotificationOutgoingLinkAndTarget =
  | CommentNotificationOccurredInBlockLink
  | CommentNotificationOccurredInEntityLink
  | CommentNotificationRepliedToCommentLink
  | CommentNotificationTriggeredByCommentLink
  | CommentNotificationTriggeredByUserLink;

export interface CommentNotificationOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1": CommentNotificationOccurredInBlockLink;
  "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2": CommentNotificationOccurredInEntityLink;
  "https://hash.ai/@hash/types/entity-type/replied-to-comment/v/1": CommentNotificationRepliedToCommentLink;
  "https://hash.ai/@hash/types/entity-type/triggered-by-comment/v/1": CommentNotificationTriggeredByCommentLink;
  "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1": CommentNotificationTriggeredByUserLink;
}

/**
 * A notification related to a comment.
 */
export interface CommentNotificationProperties
  extends CommentNotificationProperties1,
    CommentNotificationProperties2 {}
export interface CommentNotificationProperties1
  extends NotificationProperties {}

export interface CommentNotificationProperties2 {}

export interface CommentNotificationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: CommentNotificationPropertiesWithMetadataValue;
}

export interface CommentNotificationPropertiesWithMetadataValue
  extends CommentNotificationPropertiesWithMetadataValue1,
    CommentNotificationPropertiesWithMetadataValue2 {}
export interface CommentNotificationPropertiesWithMetadataValue1
  extends NotificationPropertiesWithMetadataValue {}

export interface CommentNotificationPropertiesWithMetadataValue2 {}

export interface CommentNotificationRepliedToCommentLink {
  linkEntity: RepliedToComment;
  rightEntity: Comment;
}

export interface CommentNotificationTriggeredByCommentLink {
  linkEntity: TriggeredByComment;
  rightEntity: Comment;
}

export interface CommentNotificationTriggeredByUserLink {
  linkEntity: TriggeredByUser;
  rightEntity: User;
}

/**
 * The comment that something replied to.
 */
export interface RepliedToComment extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/replied-to-comment/v/1";
  properties: RepliedToCommentProperties;
  propertiesWithMetadata: RepliedToCommentPropertiesWithMetadata;
}

export type RepliedToCommentOutgoingLinkAndTarget = never;

export interface RepliedToCommentOutgoingLinksByLinkEntityTypeId {}

/**
 * The comment that something replied to.
 */
export interface RepliedToCommentProperties
  extends RepliedToCommentProperties1,
    RepliedToCommentProperties2 {}
export interface RepliedToCommentProperties1 extends LinkProperties {}

export interface RepliedToCommentProperties2 {}

export interface RepliedToCommentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: RepliedToCommentPropertiesWithMetadataValue;
}

export interface RepliedToCommentPropertiesWithMetadataValue
  extends RepliedToCommentPropertiesWithMetadataValue1,
    RepliedToCommentPropertiesWithMetadataValue2 {}
export interface RepliedToCommentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface RepliedToCommentPropertiesWithMetadataValue2 {}

/**
 * A comment that triggered something.
 */
export interface TriggeredByComment extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/triggered-by-comment/v/1";
  properties: TriggeredByCommentProperties;
  propertiesWithMetadata: TriggeredByCommentPropertiesWithMetadata;
}

export type TriggeredByCommentOutgoingLinkAndTarget = never;

export interface TriggeredByCommentOutgoingLinksByLinkEntityTypeId {}

/**
 * A comment that triggered something.
 */
export interface TriggeredByCommentProperties
  extends TriggeredByCommentProperties1,
    TriggeredByCommentProperties2 {}
export interface TriggeredByCommentProperties1 extends LinkProperties {}

export interface TriggeredByCommentProperties2 {}

export interface TriggeredByCommentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: TriggeredByCommentPropertiesWithMetadataValue;
}

export interface TriggeredByCommentPropertiesWithMetadataValue
  extends TriggeredByCommentPropertiesWithMetadataValue1,
    TriggeredByCommentPropertiesWithMetadataValue2 {}
export interface TriggeredByCommentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface TriggeredByCommentPropertiesWithMetadataValue2 {}
