/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  ActorV2,
  ActorV2OutgoingLinkAndTarget,
  ActorV2OutgoingLinksByLinkEntityTypeId,
  ActorV2Properties,
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
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
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
  WebsiteURLPropertyValue,
} from "./shared";

export type {
  ActorV2,
  ActorV2OutgoingLinkAndTarget,
  ActorV2OutgoingLinksByLinkEntityTypeId,
  ActorV2Properties,
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
  DescriptionPropertyValue,
  DisplayNamePropertyValue,
  DraftNotePropertyValue,
  EmailPropertyValue,
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
  WebsiteURLPropertyValue,
};

export type UserV4 = Entity<UserV4Properties>;

export type UserV4HasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: ImageV1;
};

export type UserV4HasBioLink = { linkEntity: HasBio; rightEntity: ProfileBio };

export type UserV4HasLink = {
  linkEntity: Has;
  rightEntity: BrowserPluginSettings;
};

export type UserV4HasServiceAccountLink = {
  linkEntity: HasServiceAccount;
  rightEntity: ServiceAccount;
};

export type UserV4IsMemberOfLink = {
  linkEntity: IsMemberOf;
  rightEntity: Organization;
};

export type UserV4OutgoingLinkAndTarget =
  | UserV4HasAvatarLink
  | UserV4HasBioLink
  | UserV4HasServiceAccountLink
  | UserV4HasLink
  | UserV4IsMemberOfLink;

export type UserV4OutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": UserV4HasAvatarLink;
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": UserV4HasBioLink;
  "https://hash.ai/@hash/types/entity-type/has-service-account/v/1": UserV4HasServiceAccountLink;
  "https://hash.ai/@hash/types/entity-type/has/v/1": UserV4HasLink;
  "https://hash.ai/@hash/types/entity-type/is-member-of/v/1": UserV4IsMemberOfLink;
};

/**
 * A user of the HASH application.
 */
export type UserV4Properties = UserV4Properties1 & UserV4Properties2;
export type UserV4Properties1 = ActorV2Properties;

export type UserV4Properties2 = {
  /**
   * @minItems 1
   */
  "https://hash.ai/@hash/types/property-type/email/": [
    EmailPropertyValue,
    ...EmailPropertyValue[],
  ];
  "https://hash.ai/@hash/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValue;
  "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValue;
  /**
   * @maxItems 5
   */
  "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?:
    | []
    | [PinnedEntityTypeBaseURLPropertyValue]
    | [
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
      ]
    | [
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
      ]
    | [
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
      ]
    | [
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
        PinnedEntityTypeBaseURLPropertyValue,
      ];
  "https://hash.ai/@hash/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValue;
  "https://hash.ai/@hash/types/property-type/shortname/"?: ShortnamePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValue;
};
