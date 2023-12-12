/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type Actor = Entity<ActorProperties>;

export type ActorOutgoingLinkAndTarget = never;

export type ActorOutgoingLinksByLinkEntityTypeId = {};

/**
 * Someone or something that can perform actions in the system
 */
export type ActorProperties = {};

/**
 * Whether or not something has been archived.
 */
export type ArchivedPropertyValue = BooleanDataType;

export type AuthoredBy = Entity<AuthoredByProperties> & { linkData: LinkData };

export type AuthoredByOutgoingLinkAndTarget = never;

export type AuthoredByOutgoingLinksByLinkEntityTypeId = {};

/**
 * What or whom something was authored by.
 */
export type AuthoredByProperties = AuthoredByProperties1 &
  AuthoredByProperties2;
export type AuthoredByProperties1 = LinkProperties;

export type AuthoredByProperties2 = {};

export type Block = Entity<BlockProperties>;

export type BlockCollection = Entity<BlockCollectionProperties>;

export type BlockCollectionOutgoingLinkAndTarget = never;

export type BlockCollectionOutgoingLinksByLinkEntityTypeId = {};

/**
 * A collection of blocks.
 */
export type BlockCollectionProperties = {};

export type BlockHasDataLink = { linkEntity: HasData; rightEntity: Entity };

export type BlockOutgoingLinkAndTarget = BlockHasDataLink;

export type BlockOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-data/v/1": BlockHasDataLink;
};

/**
 * A block that displays or otherwise uses data, part of a wider page or collection.
 */
export type BlockProperties = {
  "https://hash.ai/@hash/types/property-type/component-id/": ComponentIdPropertyValue;
};

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type Comment = Entity<CommentProperties>;

export type CommentAuthoredByLink = {
  linkEntity: AuthoredBy;
  rightEntity: User;
};

export type CommentHasParentLink = {
  linkEntity: HasParent;
  rightEntity: Comment | Block;
};

export type CommentHasTextLink = { linkEntity: HasText; rightEntity: Text };

export type CommentOutgoingLinkAndTarget =
  | CommentAuthoredByLink
  | CommentHasParentLink
  | CommentHasTextLink;

export type CommentOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/authored-by/v/1": CommentAuthoredByLink;
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": CommentHasParentLink;
  "https://hash.ai/@hash/types/entity-type/has-text/v/1": CommentHasTextLink;
};

/**
 * Comment associated with the issue.
 */
export type CommentProperties = {
  "https://hash.ai/@hash/types/property-type/deleted-at/"?: DeletedAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/resolved-at/"?: ResolvedAtPropertyValue;
};

/**
 * An identifier for a component.
 */
export type ComponentIdPropertyValue = TextDataType;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

/**
 * Stringified timestamp of when something was deleted.
 */
export type DeletedAtPropertyValue = TextDataType;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

/**
 * An identifier for an edition of an entity
 */
export type EntityEditionIdPropertyValue = TextDataType;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

export type File = Entity<FileProperties>;

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file hosted at a URL
 */
export type FileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

/**
 * The fractional index indicating the current position of something.
 */
export type FractionalIndexPropertyValue = TextDataType;

export type HasAvatar = Entity<HasAvatarProperties> & { linkData: LinkData };

export type HasAvatarOutgoingLinkAndTarget = never;

export type HasAvatarOutgoingLinksByLinkEntityTypeId = {};

/**
 * The avatar something has.
 */
export type HasAvatarProperties = HasAvatarProperties1 & HasAvatarProperties2;
export type HasAvatarProperties1 = LinkProperties;

export type HasAvatarProperties2 = {};

export type HasBio = Entity<HasBioProperties> & { linkData: LinkData };

export type HasBioOutgoingLinkAndTarget = never;

export type HasBioOutgoingLinksByLinkEntityTypeId = {};

/**
 * The biography something has.
 */
export type HasBioProperties = HasBioProperties1 & HasBioProperties2;
export type HasBioProperties1 = LinkProperties;

export type HasBioProperties2 = {};

export type HasCoverImage = Entity<HasCoverImageProperties> & {
  linkData: LinkData;
};

export type HasCoverImageOutgoingLinkAndTarget = never;

export type HasCoverImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * The cover image something has.
 */
export type HasCoverImageProperties = HasCoverImageProperties1 &
  HasCoverImageProperties2;
export type HasCoverImageProperties1 = LinkProperties;

export type HasCoverImageProperties2 = {};

export type HasData = Entity<HasDataProperties> & { linkData: LinkData };

export type HasDataOutgoingLinkAndTarget = never;

export type HasDataOutgoingLinksByLinkEntityTypeId = {};

/**
 * The data that something has.
 */
export type HasDataProperties = HasDataProperties1 & HasDataProperties2;
export type HasDataProperties1 = LinkProperties;

export type HasDataProperties2 = {};

export type HasIndexedContent = Entity<HasIndexedContentProperties> & {
  linkData: LinkData;
};

export type HasIndexedContentOutgoingLinkAndTarget = never;

export type HasIndexedContentOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something contained at an index by something
 */
export type HasIndexedContentProperties = HasIndexedContentProperties1 &
  HasIndexedContentProperties2;
export type HasIndexedContentProperties1 = LinkProperties;

export type HasIndexedContentProperties2 = {
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
};

export type HasParent = Entity<HasParentProperties> & { linkData: LinkData };

export type HasParentOutgoingLinkAndTarget = never;

export type HasParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent something has.
 */
export type HasParentProperties = HasParentProperties1 & HasParentProperties2;
export type HasParentProperties1 = LinkProperties;

export type HasParentProperties2 = {};

export type HasServiceAccount = Entity<HasServiceAccountProperties> & {
  linkData: LinkData;
};

export type HasServiceAccountOutgoingLinkAndTarget = never;

export type HasServiceAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * The service account something has.
 */
export type HasServiceAccountProperties = HasServiceAccountProperties1 &
  HasServiceAccountProperties2;
export type HasServiceAccountProperties1 = LinkProperties;

export type HasServiceAccountProperties2 = {};

export type HasText = Entity<HasTextProperties> & { linkData: LinkData };

export type HasTextOutgoingLinkAndTarget = never;

export type HasTextOutgoingLinksByLinkEntityTypeId = {};

/**
 * The text something has.
 */
export type HasTextProperties = HasTextProperties1 & HasTextProperties2;
export type HasTextProperties1 = LinkProperties;

export type HasTextProperties2 = {};

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

export type Image = Entity<ImageProperties>;

export type ImageOutgoingLinkAndTarget = never;

export type ImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageProperties = ImageProperties1 & ImageProperties2;
export type ImageProperties1 = FileProperties;

export type ImageProperties2 = {};

export type IsMemberOf = Entity<IsMemberOfProperties> & { linkData: LinkData };

export type IsMemberOfOutgoingLinkAndTarget = never;

export type IsMemberOfOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that someone or something is a member of.
 */
export type IsMemberOfProperties = IsMemberOfProperties1 &
  IsMemberOfProperties2;
export type IsMemberOfProperties1 = LinkProperties;

export type IsMemberOfProperties2 = {};

/**
 * An identifier for a record in Ory Kratos.
 */
export type KratosIdentityIdPropertyValue = TextDataType;

export type Link = Entity<LinkProperties>;

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

/**
 * A location for something, expressed as a single string
 */
export type LocationPropertyValue = TextDataType;

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export type Notification = Entity<NotificationProperties>;

export type NotificationOutgoingLinkAndTarget = never;

export type NotificationOutgoingLinksByLinkEntityTypeId = {};

/**
 * A notification to a user.
 */
export type NotificationProperties = {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/read-at/"?: ReadAtPropertyValue;
};

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type OccurredInBlock = Entity<OccurredInBlockProperties> & {
  linkData: LinkData;
};

export type OccurredInBlockOutgoingLinkAndTarget = never;

export type OccurredInBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * A block that something occurred in.
 */
export type OccurredInBlockProperties = OccurredInBlockProperties1 &
  OccurredInBlockProperties2;
export type OccurredInBlockProperties1 = LinkProperties;

export type OccurredInBlockProperties2 = {};

export type OccurredInEntity = Entity<OccurredInEntityProperties> & {
  linkData: LinkData;
};

export type OccurredInEntityOutgoingLinkAndTarget = never;

export type OccurredInEntityOutgoingLinksByLinkEntityTypeId = {};

/**
 * An entity that something occurred in.
 */
export type OccurredInEntityProperties = OccurredInEntityProperties1 &
  OccurredInEntityProperties2;
export type OccurredInEntityProperties1 = LinkProperties;

export type OccurredInEntityProperties2 = {
  "https://hash.ai/@hash/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValue;
};

export type Organization = Entity<OrganizationProperties>;

export type OrganizationHasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: Image;
};

export type OrganizationHasBioLink = {
  linkEntity: HasBio;
  rightEntity: ProfileBio;
};

export type OrganizationHasCoverImageLink = {
  linkEntity: HasCoverImage;
  rightEntity: Image;
};

/**
 * The name of an organization.
 */
export type OrganizationNamePropertyValue = TextDataType;

export type OrganizationOutgoingLinkAndTarget =
  | OrganizationHasAvatarLink
  | OrganizationHasBioLink
  | OrganizationHasCoverImageLink;

export type OrganizationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": OrganizationHasAvatarLink;
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": OrganizationHasBioLink;
  "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1": OrganizationHasCoverImageLink;
};

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type OrganizationProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValue;
  "https://hash.ai/@hash/types/property-type/organization-name/": OrganizationNamePropertyValue;
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
  "https://hash.ai/@hash/types/property-type/shortname/": ShortnamePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValue;
};

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export type Page = Entity<PageProperties>;

export type PageHasParentLink = { linkEntity: HasParent; rightEntity: Page };

export type PageOutgoingLinkAndTarget = PageHasParentLink;

export type PageOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": PageHasParentLink;
};

/**
 * A page for displaying and potentially interacting with data.
 */
export type PageProperties = PageProperties1 & PageProperties2;
export type PageProperties1 = BlockCollectionProperties;

export type PageProperties2 = {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
  "https://hash.ai/@hash/types/property-type/icon/"?: IconPropertyValue;
  "https://hash.ai/@hash/types/property-type/summary/"?: SummaryPropertyValue;
  "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValue;
};

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = TextDataType;

/**
 * The preferred name of someone or something.
 */
export type PreferredNamePropertyValue = TextDataType;

/**
 * Someone's preferred pronouns.
 */
export type PreferredPronounsPropertyValue = TextDataType;

export type ProfileBio = Entity<ProfileBioProperties>;

export type ProfileBioHasIndexedContentLink = {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
};

export type ProfileBioOutgoingLinkAndTarget = ProfileBioHasIndexedContentLink;

export type ProfileBioOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1": ProfileBioHasIndexedContentLink;
};

/**
 * A biography for display on someone or something's profile.
 */
export type ProfileBioProperties = ProfileBioProperties1 &
  ProfileBioProperties2;
export type ProfileBioProperties1 = BlockCollectionProperties;

export type ProfileBioProperties2 = {};

/**
 * A URL to a profile
 */
export type ProfileURLPropertyValue = TextDataType;

/**
 * The timestamp of when something was read.
 */
export type ReadAtPropertyValue = TextDataType;

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = TextDataType;

export type ServiceAccount = Entity<ServiceAccountProperties>;

export type ServiceAccountOutgoingLinkAndTarget = never;

export type ServiceAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A service account.
 */
export type ServiceAccountProperties = {
  "https://hash.ai/@hash/types/property-type/profile-url/": ProfileURLPropertyValue;
};

/**
 * A unique identifier for something, in the form of a slug
 */
export type ShortnamePropertyValue = TextDataType;

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

export type Text = Entity<TextProperties>;

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

export type TextOutgoingLinkAndTarget = never;

export type TextOutgoingLinksByLinkEntityTypeId = {};

/**
 * An ordered sequence of characters.
 */
export type TextProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
};

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType | ObjectDataType[];

/**
 * The title of something.
 */
export type TitlePropertyValue = TextDataType;

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

export type User = Entity<UserProperties>;

export type UserHasAvatarLink = { linkEntity: HasAvatar; rightEntity: Image };

export type UserHasBioLink = { linkEntity: HasBio; rightEntity: ProfileBio };

export type UserHasServiceAccountLink = {
  linkEntity: HasServiceAccount;
  rightEntity: ServiceAccount;
};

export type UserIsMemberOfLink = {
  linkEntity: IsMemberOf;
  rightEntity: Organization;
};

export type UserOutgoingLinkAndTarget =
  | UserHasAvatarLink
  | UserHasBioLink
  | UserHasServiceAccountLink
  | UserIsMemberOfLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": UserHasAvatarLink;
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": UserHasBioLink;
  "https://hash.ai/@hash/types/entity-type/has-service-account/v/1": UserHasServiceAccountLink;
  "https://hash.ai/@hash/types/entity-type/is-member-of/v/1": UserIsMemberOfLink;
};

/**
 * A user of the HASH application.
 */
export type UserProperties = UserProperties1 & UserProperties2;
export type UserProperties1 = ActorProperties;

export type UserProperties2 = {
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
  "https://hash.ai/@hash/types/property-type/preferred-name/"?: PreferredNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValue;
  "https://hash.ai/@hash/types/property-type/shortname/"?: ShortnamePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValue;
};

export type UserSecret = Entity<UserSecretProperties>;

export type UserSecretOutgoingLinkAndTarget = never;

export type UserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecretProperties = {
  "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValue;
};

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

/**
 * A URL for a website
 */
export type WebsiteURLPropertyValue = TextDataType;
