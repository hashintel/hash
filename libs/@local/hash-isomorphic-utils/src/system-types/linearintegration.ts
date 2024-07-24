/**
 * This file was automatically generated – do not edit it.
 */

import type { ArrayMetadata, ObjectMetadata } from "@local/hash-graph-client";
import type {
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  ActorPropertiesWithMetadataValue,
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
  HasProperties,
  HasPropertiesWithMetadata,
  HasPropertiesWithMetadataValue,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  HasServiceAccountPropertiesWithMetadataValue,
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
  OrganizationPropertiesWithMetadataValue,
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
  ProfileBioPropertiesWithMetadataValue,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ServiceAccountPropertiesWithMetadataValue,
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
  UserPropertiesWithMetadataValue,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UserSecretPropertiesWithMetadataValue,
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
  ActorPropertiesWithMetadataValue,
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
  HasProperties,
  HasPropertiesWithMetadata,
  HasPropertiesWithMetadataValue,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  HasServiceAccountPropertiesWithMetadataValue,
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
  OrganizationPropertiesWithMetadataValue,
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
  ProfileBioPropertiesWithMetadataValue,
  ProfileURLPropertyValue,
  ProfileURLPropertyValueWithMetadata,
  ServiceAccount,
  ServiceAccountOutgoingLinkAndTarget,
  ServiceAccountOutgoingLinksByLinkEntityTypeId,
  ServiceAccountProperties,
  ServiceAccountPropertiesWithMetadata,
  ServiceAccountPropertiesWithMetadataValue,
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
  UserPropertiesWithMetadataValue,
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserSecretPropertiesWithMetadata,
  UserSecretPropertiesWithMetadataValue,
  VaultPathPropertyValue,
  VaultPathPropertyValueWithMetadata,
  WebsiteURLPropertyValue,
  WebsiteURLPropertyValueWithMetadata,
};

/**
 * An instance of an integration with Linear.
 */
export interface LinearIntegration extends EntityProperties {
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
export interface LinearIntegrationProperties extends PropertyObject {
  "https://hash.ai/@hash/types/property-type/linear-org-id/": LinearOrgIdPropertyValue;
}

export interface LinearIntegrationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: LinearIntegrationPropertiesWithMetadataValue;
}

export interface LinearIntegrationPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://hash.ai/@hash/types/property-type/linear-org-id/": LinearOrgIdPropertyValueWithMetadata;
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

export interface LinearOrgIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The unique identifier for a team in Linear.
 */
export type LinearTeamIdPropertyValue = TextDataType;

export interface LinearTeamIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Something that syncs linear data with something.
 */
export interface SyncLinearDataWith extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/sync-linear-data-with/v/1";
  properties: SyncLinearDataWithProperties;
  propertiesWithMetadata: SyncLinearDataWithPropertiesWithMetadata;
}

export type SyncLinearDataWithOutgoingLinkAndTarget = never;

export interface SyncLinearDataWithOutgoingLinksByLinkEntityTypeId {}

/**
 * Something that syncs linear data with something.
 */
export interface SyncLinearDataWithProperties
  extends SyncLinearDataWithProperties1,
    SyncLinearDataWithProperties2 {}
export interface SyncLinearDataWithProperties1 extends LinkProperties {}

export interface SyncLinearDataWithProperties2 {
  "https://hash.ai/@hash/types/property-type/linear-team-id/"?: LinearTeamIdPropertyValue[];
}

export interface SyncLinearDataWithPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: SyncLinearDataWithPropertiesWithMetadataValue;
}

export interface SyncLinearDataWithPropertiesWithMetadataValue
  extends SyncLinearDataWithPropertiesWithMetadataValue1,
    SyncLinearDataWithPropertiesWithMetadataValue2 {}
export interface SyncLinearDataWithPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface SyncLinearDataWithPropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/linear-team-id/"?: {
    value: LinearTeamIdPropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
}

/**
 * The user secret something uses.
 */
export interface UsesUserSecret extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/uses-user-secret/v/1";
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
}

export type UsesUserSecretOutgoingLinkAndTarget = never;

export interface UsesUserSecretOutgoingLinksByLinkEntityTypeId {}

/**
 * The user secret something uses.
 */
export interface UsesUserSecretProperties
  extends UsesUserSecretProperties1,
    UsesUserSecretProperties2 {}
export interface UsesUserSecretProperties1 extends LinkProperties {}

export interface UsesUserSecretProperties2 {}

export interface UsesUserSecretPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: UsesUserSecretPropertiesWithMetadataValue;
}

export interface UsesUserSecretPropertiesWithMetadataValue
  extends UsesUserSecretPropertiesWithMetadataValue1,
    UsesUserSecretPropertiesWithMetadataValue2 {}
export interface UsesUserSecretPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface UsesUserSecretPropertiesWithMetadataValue2 {}
