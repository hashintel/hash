/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

import {
  ActorV1,
  ActorV1OutgoingLinkAndTarget,
  ActorV1OutgoingLinksByLinkEntityTypeId,
  ActorV1Properties,
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
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FileV1,
  FileV1OutgoingLinkAndTarget,
  FileV1OutgoingLinksByLinkEntityTypeId,
  FileV1Properties,
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
  ImageV1,
  ImageV1OutgoingLinkAndTarget,
  ImageV1OutgoingLinksByLinkEntityTypeId,
  ImageV1Properties,
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
  PreferredNamePropertyValue,
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
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserV3,
  UserV3HasAvatarLink,
  UserV3HasBioLink,
  UserV3HasLink,
  UserV3HasServiceAccountLink,
  UserV3IsMemberOfLink,
  UserV3OutgoingLinkAndTarget,
  UserV3OutgoingLinksByLinkEntityTypeId,
  UserV3Properties,
  VaultPathPropertyValue,
  WebsiteURLPropertyValue,
} from "./shared";

export type {
  ActorV1,
  ActorV1OutgoingLinkAndTarget,
  ActorV1OutgoingLinksByLinkEntityTypeId,
  ActorV1Properties,
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
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
  ExpiredAtPropertyValue,
  FileHashPropertyValue,
  FileNamePropertyValue,
  FileSizePropertyValue,
  FileStorageBucketPropertyValue,
  FileStorageEndpointPropertyValue,
  FileStorageForcePathStylePropertyValue,
  FileStorageKeyPropertyValue,
  FileStorageProviderPropertyValue,
  FileStorageRegionPropertyValue,
  FileURLPropertyValue,
  FileV1,
  FileV1OutgoingLinkAndTarget,
  FileV1OutgoingLinksByLinkEntityTypeId,
  FileV1Properties,
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
  ImageV1,
  ImageV1OutgoingLinkAndTarget,
  ImageV1OutgoingLinksByLinkEntityTypeId,
  ImageV1Properties,
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
  PreferredNamePropertyValue,
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
  UserSecret,
  UserSecretOutgoingLinkAndTarget,
  UserSecretOutgoingLinksByLinkEntityTypeId,
  UserSecretProperties,
  UserV3,
  UserV3HasAvatarLink,
  UserV3HasBioLink,
  UserV3HasLink,
  UserV3HasServiceAccountLink,
  UserV3IsMemberOfLink,
  UserV3OutgoingLinkAndTarget,
  UserV3OutgoingLinksByLinkEntityTypeId,
  UserV3Properties,
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
  rightEntity: UserV3 | Organization;
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

export type UsesUserSecret = Entity<UsesUserSecretProperties> & {
  linkData: LinkData;
};

export type UsesUserSecretOutgoingLinkAndTarget = never;

export type UsesUserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = UsesUserSecretProperties1 &
  UsesUserSecretProperties2;
export type UsesUserSecretProperties1 = LinkProperties;

export type UsesUserSecretProperties2 = {};
