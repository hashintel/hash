/**
 * This file was automatically generated – do not edit it.
 */

import type { ArrayMetadata, ObjectMetadata } from "@blockprotocol/type-system";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  ApplicationPreferencesPropertyValue,
  ApplicationPreferencesPropertyValueWithMetadata,
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
  BytesDataType,
  BytesDataTypeWithMetadata,
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
  EmailDataType,
  EmailDataTypeWithMetadata,
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
  HasIssuedInvitation,
  HasIssuedInvitationOutgoingLinkAndTarget,
  HasIssuedInvitationOutgoingLinksByLinkEntityTypeId,
  HasIssuedInvitationProperties,
  HasIssuedInvitationPropertiesWithMetadata,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  ImageFile,
  ImageFileOutgoingLinkAndTarget,
  ImageFileOutgoingLinksByLinkEntityTypeId,
  ImageFileProperties,
  ImageFilePropertiesWithMetadata,
  InformationDataType,
  InformationDataTypeWithMetadata,
  Integration,
  IntegrationOutgoingLinkAndTarget,
  IntegrationOutgoingLinksByLinkEntityTypeId,
  IntegrationProperties,
  IntegrationPropertiesWithMetadata,
  Invitation,
  InvitationOutgoingLinkAndTarget,
  InvitationOutgoingLinksByLinkEntityTypeId,
  InvitationProperties,
  InvitationPropertiesWithMetadata,
  InvitationViaEmail,
  InvitationViaEmailOutgoingLinkAndTarget,
  InvitationViaEmailOutgoingLinksByLinkEntityTypeId,
  InvitationViaEmailProperties,
  InvitationViaEmailPropertiesWithMetadata,
  InvitationViaShortname,
  InvitationViaShortnameOutgoingLinkAndTarget,
  InvitationViaShortnameOutgoingLinksByLinkEntityTypeId,
  InvitationViaShortnameProperties,
  InvitationViaShortnamePropertiesWithMetadata,
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
  OrganizationHasIssuedInvitationLink,
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
  URIDataType,
  URIDataTypeWithMetadata,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasCoverImageLink,
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
  ApplicationPreferencesPropertyValue,
  ApplicationPreferencesPropertyValueWithMetadata,
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
  BytesDataType,
  BytesDataTypeWithMetadata,
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
  EmailDataType,
  EmailDataTypeWithMetadata,
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
  HasIssuedInvitation,
  HasIssuedInvitationOutgoingLinkAndTarget,
  HasIssuedInvitationOutgoingLinksByLinkEntityTypeId,
  HasIssuedInvitationProperties,
  HasIssuedInvitationPropertiesWithMetadata,
  HasOutgoingLinkAndTarget,
  HasOutgoingLinksByLinkEntityTypeId,
  HasProperties,
  HasPropertiesWithMetadata,
  HasServiceAccount,
  HasServiceAccountOutgoingLinkAndTarget,
  HasServiceAccountOutgoingLinksByLinkEntityTypeId,
  HasServiceAccountProperties,
  HasServiceAccountPropertiesWithMetadata,
  ImageFile,
  ImageFileOutgoingLinkAndTarget,
  ImageFileOutgoingLinksByLinkEntityTypeId,
  ImageFileProperties,
  ImageFilePropertiesWithMetadata,
  InformationDataType,
  InformationDataTypeWithMetadata,
  Integration,
  IntegrationOutgoingLinkAndTarget,
  IntegrationOutgoingLinksByLinkEntityTypeId,
  IntegrationProperties,
  IntegrationPropertiesWithMetadata,
  Invitation,
  InvitationOutgoingLinkAndTarget,
  InvitationOutgoingLinksByLinkEntityTypeId,
  InvitationProperties,
  InvitationPropertiesWithMetadata,
  InvitationViaEmail,
  InvitationViaEmailOutgoingLinkAndTarget,
  InvitationViaEmailOutgoingLinksByLinkEntityTypeId,
  InvitationViaEmailProperties,
  InvitationViaEmailPropertiesWithMetadata,
  InvitationViaShortname,
  InvitationViaShortnameOutgoingLinkAndTarget,
  InvitationViaShortnameOutgoingLinksByLinkEntityTypeId,
  InvitationViaShortnameProperties,
  InvitationViaShortnamePropertiesWithMetadata,
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
  OrganizationHasIssuedInvitationLink,
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
  URIDataType,
  URIDataTypeWithMetadata,
  User,
  UserHasAvatarLink,
  UserHasBioLink,
  UserHasCoverImageLink,
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
export type LinearIntegration = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/linear-integration/v/9",
  ];
  properties: LinearIntegrationProperties;
  propertiesWithMetadata: LinearIntegrationPropertiesWithMetadata;
};

export type LinearIntegrationOutgoingLinkAndTarget =
  | LinearIntegrationSyncLinearDataWithLink
  | LinearIntegrationUsesUserSecretLink;

export type LinearIntegrationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/sync-linear-data-with/v/1": LinearIntegrationSyncLinearDataWithLink;
  "https://hash.ai/@h/types/entity-type/uses-user-secret/v/1": LinearIntegrationUsesUserSecretLink;
};

/**
 * An instance of an integration with Linear.
 */
export type LinearIntegrationProperties = IntegrationProperties & {
  "https://hash.ai/@h/types/property-type/linear-org-id/": LinearOrgIdPropertyValue;
};

export type LinearIntegrationPropertiesWithMetadata =
  IntegrationPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/linear-org-id/": LinearOrgIdPropertyValueWithMetadata;
    };
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

export type LinearOrgIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The unique identifier for a team in Linear.
 */
export type LinearTeamIdPropertyValue = TextDataType;

export type LinearTeamIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Something that syncs linear data with something.
 */
export type SyncLinearDataWith = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/sync-linear-data-with/v/1",
  ];
  properties: SyncLinearDataWithProperties;
  propertiesWithMetadata: SyncLinearDataWithPropertiesWithMetadata;
};

export type SyncLinearDataWithOutgoingLinkAndTarget = never;

export type SyncLinearDataWithOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that syncs linear data with something.
 */
export type SyncLinearDataWithProperties = LinkProperties & {
  "https://hash.ai/@h/types/property-type/linear-team-id/"?: LinearTeamIdPropertyValue[];
};

export type SyncLinearDataWithPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/linear-team-id/"?: {
        value: LinearTeamIdPropertyValueWithMetadata[];
        metadata?: ArrayMetadata;
      };
    };
  };

/**
 * The user secret something uses.
 */
export type UsesUserSecret = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/uses-user-secret/v/1"];
  properties: UsesUserSecretProperties;
  propertiesWithMetadata: UsesUserSecretPropertiesWithMetadata;
};

export type UsesUserSecretOutgoingLinkAndTarget = never;

export type UsesUserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * The user secret something uses.
 */
export type UsesUserSecretProperties = LinkProperties & {};

export type UsesUserSecretPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };
