/**
 * This file was automatically generated – do not edit it.
 */

import type { ArrayMetadata, ObjectMetadata } from "@local/hash-graph-client";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  AutomaticInferenceConfigurationPropertyValue,
  AutomaticInferenceConfigurationPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  BrowserPluginTabPropertyValue,
  BrowserPluginTabPropertyValueWithMetadata,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  ConnectionSourceNamePropertyValue,
  ConnectionSourceNamePropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
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
  ExpiredAtPropertyValue,
  ExpiredAtPropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
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
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasBioPropertiesWithMetadata,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasCoverImagePropertiesWithMetadata,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  ImagePropertiesWithMetadata,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  IsMemberOfPropertiesWithMetadata,
  KratosIdentityIdPropertyValue,
  KratosIdentityIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
  ManualInferenceConfigurationPropertyValue,
  ManualInferenceConfigurationPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
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
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
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
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ShortnamePropertyValue,
  ShortnamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
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
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
} from "./shared.js";

export type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  AutomaticInferenceConfigurationPropertyValue,
  AutomaticInferenceConfigurationPropertyValueWithMetadata,
  Block,
  BlockCollection,
  BlockCollectionOutgoingLinkAndTarget,
  BlockCollectionOutgoingLinksByLinkEntityTypeId,
  BlockCollectionProperties,
  BlockCollectionPropertiesWithMetadata,
  BlockHasDataLink,
  BlockOutgoingLinkAndTarget,
  BlockOutgoingLinksByLinkEntityTypeId,
  BlockProperties,
  BlockPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  BrowserPluginSettings,
  BrowserPluginSettingsOutgoingLinkAndTarget,
  BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId,
  BrowserPluginSettingsProperties,
  BrowserPluginSettingsPropertiesWithMetadata,
  BrowserPluginTabPropertyValue,
  BrowserPluginTabPropertyValueWithMetadata,
  ComponentIdPropertyValue,
  ComponentIdPropertyValueWithMetadata,
  ConnectionSourceNamePropertyValue,
  ConnectionSourceNamePropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
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
  ExpiredAtPropertyValue,
  ExpiredAtPropertyValueWithMetadata,
  File,
  FileHashPropertyValue,
  FileHashPropertyValueWithMetadata,
  FileNamePropertyValue,
  FileNamePropertyValueWithMetadata,
  FileOutgoingLinkAndTarget,
  FileOutgoingLinksByLinkEntityTypeId,
  FileProperties,
  FilePropertiesWithMetadata,
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
  HasBio,
  HasBioOutgoingLinkAndTarget,
  HasBioOutgoingLinksByLinkEntityTypeId,
  HasBioProperties,
  HasBioPropertiesWithMetadata,
  HasCoverImage,
  HasCoverImageOutgoingLinkAndTarget,
  HasCoverImageOutgoingLinksByLinkEntityTypeId,
  HasCoverImageProperties,
  HasCoverImagePropertiesWithMetadata,
  HasData,
  HasDataOutgoingLinkAndTarget,
  HasDataOutgoingLinksByLinkEntityTypeId,
  HasDataProperties,
  HasDataPropertiesWithMetadata,
  HasIndexedContent,
  HasIndexedContentOutgoingLinkAndTarget,
  HasIndexedContentOutgoingLinksByLinkEntityTypeId,
  HasIndexedContentProperties,
  HasIndexedContentPropertiesWithMetadata,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  Image,
  ImageOutgoingLinkAndTarget,
  ImageOutgoingLinksByLinkEntityTypeId,
  ImageProperties,
  ImagePropertiesWithMetadata,
  IsMemberOf,
  IsMemberOfOutgoingLinkAndTarget,
  IsMemberOfOutgoingLinksByLinkEntityTypeId,
  IsMemberOfProperties,
  IsMemberOfPropertiesWithMetadata,
  KratosIdentityIdPropertyValue,
  KratosIdentityIdPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LocationPropertyValue,
  LocationPropertyValueWithMetadata,
  ManualInferenceConfigurationPropertyValue,
  ManualInferenceConfigurationPropertyValueWithMetadata,
  MIMETypePropertyValue,
  MIMETypePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
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
  OriginalFileNamePropertyValue,
  OriginalFileNamePropertyValueWithMetadata,
  OriginalSourcePropertyValue,
  OriginalSourcePropertyValueWithMetadata,
  OriginalURLPropertyValue,
  OriginalURLPropertyValueWithMetadata,
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
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ShortnamePropertyValue,
  ShortnamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
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
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
};

/**
 * An instance of an integration with Linear.
 */
export interface LinearIntegration {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/linear-integration/v/6";
  properties: LinearIntegrationProperties;
  propertiesWithMetadata: LinearIntegrationPropertiesWithMetadata;
}

export type LinearIntegrationOutgoingLinkAndTarget =
  | LinearIntegrationSyncLinearDataWithLink
  | LinearIntegrationUsesUserSecretLink;

export interface LinearIntegrationOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1": LinearIntegrationSyncLinearDataWithLink;
  "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1": LinearIntegrationUsesUserSecretLink;
}

/**
 * An instance of an integration with Linear.
 */
export interface LinearIntegrationProperties {
  "https://hash.ai/@hash/types/property-type/linear-org-id/": LinearOrgIdPropertyValue;
}

export interface LinearIntegrationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/linear-org-id/": LinearOrgIdPropertyValueWithMetadata;
  };
}

export interface LinearIntegrationSyncLinearDataWithLink {
  linkEntity: SyncLinearDataWith;
  rightEntity: User | Organization;
}

export interface LinearIntegrationUsesUserSecretLink {
  linkEntity: UsesUserSecret;
  rightEntity: UserSecret;
}

/**
 * The unique identifier for an org in Linear.
 */
export type LinearOrgIdPropertyValue = TextDataType;

export type LinearOrgIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The unique identifier for a team in Linear.
 */
export type LinearTeamIdPropertyValue = TextDataType;

export type LinearTeamIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Something that syncs linear data with something.
 */
export interface SyncLinearDataWith {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1";
  properties: SyncLinearDataWithProperties;
  propertiesWithMetadata: SyncLinearDataWithPropertiesWithMetadata;
}

export type SyncLinearDataWithOutgoingLinkAndTarget = never;

export interface SyncLinearDataWithOutgoingLinksByLinkEntityTypeId {}

/**
 * Something that syncs linear data with something.
 */
export type SyncLinearDataWithProperties = SyncLinearDataWithProperties1 &
  SyncLinearDataWithProperties2;
export type SyncLinearDataWithProperties1 = LinkProperties;

export interface SyncLinearDataWithProperties2 {
  "https://hash.ai/@hash/types/property-type/linear-team-id/"?: LinearTeamIdPropertyValue[];
}

export type SyncLinearDataWithPropertiesWithMetadata =
  SyncLinearDataWithPropertiesWithMetadata1 &
    SyncLinearDataWithPropertiesWithMetadata2;
export type SyncLinearDataWithPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export interface SyncLinearDataWithPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/linear-team-id/"?: {
      value: LinearTeamIdPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
  };
}

/**
 * The user secret something uses.
 */
export interface UsesUserSecret {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1";
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
}

export type UsesUserSecretOutgoingLinkAndTarget = never;

export interface UsesUserSecretOutgoingLinksByLinkEntityTypeId {}

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = UsesUserSecretProperties1 &
  UsesUserSecretProperties2;
export type UsesUserSecretProperties1 = LinkProperties;

export interface UsesUserSecretProperties2 {}

export type UsesUserSecretPropertiesWithMetadata =
  UsesUserSecretPropertiesWithMetadata1 & UsesUserSecretPropertiesWithMetadata2;
export type UsesUserSecretPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface UsesUserSecretPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}
