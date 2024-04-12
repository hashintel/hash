/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@local/hash-subgraph";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  AutomaticInferenceConfigurationPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginTabPropertyValue,
  ComponentIdPropertyValue,
  ConnectionSourceNamePropertyValue,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
  EnabledFeatureFlagsPropertyValue,
  ExpiredAtPropertyValue,
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
  Has,
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
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
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
  ManualInferenceConfigurationPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  ObjectDataType,
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
  PinnedEntityTypeBaseURLPropertyValue,
  PreferredPronounsPropertyValue,
  ProfileBio,
  ProfileBioHasIndexedContentLink,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileURLPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ShortnamePropertyValue,
  TextDataType,
  UploadCompletedAtPropertyValue,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  VaultPathPropertyValue,
  WebsiteURLPropertyValue,
} from "./shared";

export type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  AutomaticInferenceConfigurationPropertyValue,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BooleanDataType,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginTabPropertyValue,
  ComponentIdPropertyValue,
  ConnectionSourceNamePropertyValue,
  DateTimeDataType,
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
  EnabledFeatureFlagsPropertyValue,
  ExpiredAtPropertyValue,
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
  Has,
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
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
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
  ManualInferenceConfigurationPropertyValue,
  MIMETypePropertyValue,
  NumberDataType,
  ObjectDataType,
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
  PinnedEntityTypeBaseURLPropertyValue,
  PreferredPronounsPropertyValue,
  ProfileBio,
  ProfileBioHasIndexedContentLink,
  ProfileBioOutgoingLinkAndTarget,
  ProfileBioOutgoingLinksByLinkEntityTypeId,
  ProfileBioProperties,
  ProfileURLPropertyValue,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ShortnamePropertyValue,
  TextDataType,
  UploadCompletedAtPropertyValue,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasLink,
  UserHasServiceAccountLink,
  UserIsMemberOfLink,
  UserOutgoingLinkAndTarget,
  UserOutgoingLinksByLinkEntityTypeId,
  UserProperties,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UsesUserSecret,
  UsesUserSecretOutgoingLinkAndTarget,
  UsesUserSecretOutgoingLinksByLinkEntityTypeId,
  UsesUserSecretProperties,
  VaultPathPropertyValue,
  WebsiteURLPropertyValue,
};

export type LinearIntegration = Entity<LinearIntegrationProperties>;

export type LinearIntegrationOutgoingLinkAndTarget =
  | LinearIntegrationSyncLinearDataWithLink
  | LinearIntegrationUsesUserSecretLink;

export type LinearIntegrationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1": LinearIntegrationSyncLinearDataWithLink;
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1": LinearIntegrationUsesUserSecretLink;
};

/**
 * An instance of an integration with Linear.
 */
export type LinearIntegrationProperties = {
  "https://hash.ai/@hash/types/property-type/linear-org-id/": LinearOrgIdPropertyValue;
};

export type LinearIntegrationSyncLinearDataWithLink = {
  linkEntity: SyncLinearDataWith;
  rightEntity: User | Organization;
};

export type LinearIntegrationUsesUserSecretLink = {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
};

/**
 * The unique identifier for an org in Linear.
 */
export type LinearOrgIdPropertyValue = TextDataType;

/**
 * The unique identifier for a team in Linear.
 */
export type LinearTeamIdPropertyValue = TextDataType;

export type SyncLinearDataWith = Entity<SyncLinearDataWithProperties> & {
  linkData: LinkData;
};

export type SyncLinearDataWithOutgoingLinkAndTarget = never;

export type SyncLinearDataWithOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that syncs linear data with something.
 */
export type SyncLinearDataWithProperties = SyncLinearDataWithProperties1 &
  SyncLinearDataWithProperties2;
export type SyncLinearDataWithProperties1 = LinkProperties;

export type SyncLinearDataWithProperties2 = {
  "https://hash.ai/@hash/types/property-type/linear-team-id/"?: LinearTeamIdPropertyValue[];
};
