/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

/**
 * Whether or not something has been archived.
 */
export type ArchivedPropertyValue = BooleanDataType;

export type Author = Entity<AuthorProperties> & { linkData: LinkData };

export type AuthorOutgoingLinkAndTarget = never;

export type AuthorOutgoingLinksByLinkEntityTypeId = {};

/**
 * The author of something.
 */
export type AuthorProperties = AuthorProperties1 & AuthorProperties2;
export type AuthorProperties1 = LinkProperties;

export type AuthorProperties2 = {};

export type Block = Entity<BlockProperties>;

export type BlockBlockDataLink = { linkEntity: BlockData; rightEntity: Entity };

export type BlockCollection = Entity<BlockCollectionProperties>;

export type BlockCollectionContainsLink = {
  linkEntity: Contains;
  rightEntity: Block;
};

export type BlockCollectionOutgoingLinkAndTarget = BlockCollectionContainsLink;

export type BlockCollectionOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/contains/v/1": BlockCollectionContainsLink;
};

export type BlockCollectionProperties = {};

export type BlockData = Entity<BlockDataProperties> & { linkData: LinkData };

export type BlockDataOutgoingLinkAndTarget = never;

export type BlockDataOutgoingLinksByLinkEntityTypeId = {};

/**
 * The entity representing the data in a block.
 */
export type BlockDataProperties = BlockDataProperties1 & BlockDataProperties2;
export type BlockDataProperties1 = LinkProperties;

export type BlockDataProperties2 = {};

export type BlockOutgoingLinkAndTarget = BlockBlockDataLink;

export type BlockOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/block-data/v/1": BlockBlockDataLink;
};

export type BlockProperties = {
  "http://localhost:3000/@system-user/types/property-type/component-id/": ComponentIdPropertyValue;
};

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type Comment = Entity<CommentProperties>;

export type CommentAuthorLink = { linkEntity: Author; rightEntity: User };

export type CommentHasTextLink = { linkEntity: HasText; rightEntity: Text };

export type CommentOutgoingLinkAndTarget =
  | CommentAuthorLink
  | CommentHasTextLink
  | CommentParentLink;

export type CommentOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/author/v/1": CommentAuthorLink;
  "http://localhost:3000/@system-user/types/entity-type/has-text/v/1": CommentHasTextLink;
  "http://localhost:3000/@system-user/types/entity-type/parent/v/1": CommentParentLink;
};

export type CommentParentLink = {
  linkEntity: Parent;
  rightEntity: Comment | Block;
};

export type CommentProperties = {
  "http://localhost:3000/@system-user/types/property-type/deleted-at/"?: DeletedAtPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/resolved-at/"?: ResolvedAtPropertyValue;
};

export type ComponentIdPropertyValue = TextDataType;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type Contains = Entity<ContainsProperties> & { linkData: LinkData };

export type ContainsOutgoingLinkAndTarget = never;

export type ContainsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something containing something.
 */
export type ContainsProperties = ContainsProperties1 & ContainsProperties2;
export type ContainsProperties1 = LinkProperties;

export type ContainsProperties2 = {};

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

export type EmailPropertyValue = TextDataType;

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
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type HasAction = Entity<HasActionProperties> & { linkData: LinkData };

export type HasActionOutgoingLinkAndTarget = never;

export type HasActionOutgoingLinksByLinkEntityTypeId = {};

/**
 * Has an action.
 */
export type HasActionProperties = HasActionProperties1 & HasActionProperties2;
export type HasActionProperties1 = LinkProperties;

export type HasActionProperties2 = {};

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
 * Something that has a bio.
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

export type HasServiceAccount = Entity<HasServiceAccountProperties> & {
  linkData: LinkData;
};

export type HasServiceAccountOutgoingLinkAndTarget = never;

export type HasServiceAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that has a service account.
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

/**
 * The (fractional) index indicating the current position of something.
 */
export type IndexPropertyValue = TextDataType;

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

export type NotificationAction = Entity<NotificationActionProperties>;

export type NotificationActionOutgoingLinkAndTarget = never;

export type NotificationActionOutgoingLinksByLinkEntityTypeId = {};

export type NotificationActionProperties = {
  "http://localhost:3000/@system-user/types/property-type/title/": TitlePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/url/": URLPropertyValue;
};

export type NotificationHasActionLink = {
  linkEntity: HasAction;
  rightEntity: NotificationAction;
};

export type NotificationOutgoingLinkAndTarget = NotificationHasActionLink;

export type NotificationOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/has-action/v/1": NotificationHasActionLink;
};

export type NotificationProperties = {
  "http://localhost:3000/@system-user/types/property-type/archived/"?: ArchivedPropertyValue;
};

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

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

export type OccurredInEntityProperties2 = {};

export type Org = Entity<OrgProperties>;

export type OrgHasAvatarLink = { linkEntity: HasAvatar; rightEntity: Image };

export type OrgHasBioLink = { linkEntity: HasBio; rightEntity: ProfileBio };

export type OrgHasCoverImageLink = {
  linkEntity: HasCoverImage;
  rightEntity: Image;
};

export type OrgMembership = Entity<OrgMembershipProperties> & {
  linkData: LinkData;
};

export type OrgMembershipOutgoingLinkAndTarget = never;

export type OrgMembershipOutgoingLinksByLinkEntityTypeId = {};

export type OrgMembershipProperties = OrgMembershipProperties1 &
  OrgMembershipProperties2;
export type OrgMembershipProperties1 = LinkProperties;

export type OrgMembershipProperties2 = {};

export type OrgOutgoingLinkAndTarget =
  | OrgHasAvatarLink
  | OrgHasBioLink
  | OrgHasCoverImageLink;

export type OrgOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/has-avatar/v/1": OrgHasAvatarLink;
  "http://localhost:3000/@system-user/types/entity-type/has-bio/v/1": OrgHasBioLink;
  "http://localhost:3000/@system-user/types/entity-type/has-cover-image/v/1": OrgHasCoverImageLink;
};

export type OrgProperties = {
  "http://localhost:3000/@system-user/types/property-type/location/"?: LocationPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/organization-name/": OrganizationNamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/organization-provided-information/"?: OrganizationProvidedInformationPropertyValue;
  /**
   * @maxItems 5
   */
  "http://localhost:3000/@system-user/types/property-type/pinned-entity-type-base-url/"?:
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
  "http://localhost:3000/@system-user/types/property-type/shortname/": ShortnamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/website/"?: WebsitePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
};

export type OrganizationNamePropertyValue = TextDataType;

export type OrganizationProvidedInformationPropertyValue = {
  "http://localhost:3000/@system-user/types/property-type/organization-size/"?: OrganizationSizePropertyValue;
};

export type OrganizationSizePropertyValue = TextDataType;

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

export type PageOutgoingLinkAndTarget = PageParentLink;

export type PageOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/parent/v/1": PageParentLink;
};

export type PageParentLink = { linkEntity: Parent; rightEntity: Page };

export type PageProperties = PageProperties1 & PageProperties2;
export type PageProperties1 = BlockCollectionProperties;

export type PageProperties2 = {
  "http://localhost:3000/@system-user/types/property-type/archived/"?: ArchivedPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/icon/"?: IconPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/index/": IndexPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/summary/"?: SummaryPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/title/": TitlePropertyValue;
};

export type Parent = Entity<ParentProperties> & { linkData: LinkData };

export type ParentOutgoingLinkAndTarget = never;

export type ParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent of something.
 */
export type ParentProperties = ParentProperties1 & ParentProperties2;
export type ParentProperties1 = LinkProperties;

export type ParentProperties2 = {};

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = TextDataType;

export type PreferredNamePropertyValue = TextDataType;

export type PreferredPronounsPropertyValue = TextDataType;

export type ProfileBio = Entity<ProfileBioProperties>;

export type ProfileBioOutgoingLinkAndTarget = never;

export type ProfileBioOutgoingLinksByLinkEntityTypeId = {};

export type ProfileBioProperties = ProfileBioProperties1 &
  ProfileBioProperties2;
export type ProfileBioProperties1 = BlockCollectionProperties;

export type ProfileBioProperties2 = {};

/**
 * A URL to a profile
 */
export type ProfileURLPropertyValue = TextDataType;

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
  "http://localhost:3000/@system-user/types/property-type/profile-url/": ProfileURLPropertyValue;
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

export type TextProperties = {
  "http://localhost:3000/@system-user/types/property-type/tokens/": TokensPropertyValue[];
};

/**
 * The title of something.
 */
export type TitlePropertyValue = TextDataType;

export type TokensPropertyValue = ObjectDataType;

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

/**
 * A URL.
 */
export type URLPropertyValue = TextDataType;

export type User = Entity<UserProperties>;

export type UserHasAvatarLink = { linkEntity: HasAvatar; rightEntity: Image };

export type UserHasBioLink = { linkEntity: HasBio; rightEntity: ProfileBio };

export type UserHasServiceAccountLink = {
  linkEntity: HasServiceAccount;
  rightEntity: ServiceAccount;
};

export type UserOrgMembershipLink = {
  linkEntity: OrgMembership;
  rightEntity: Org;
};

export type UserOutgoingLinkAndTarget =
  | UserHasAvatarLink
  | UserHasBioLink
  | UserHasServiceAccountLink
  | UserOrgMembershipLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/has-avatar/v/1": UserHasAvatarLink;
  "http://localhost:3000/@system-user/types/entity-type/has-bio/v/1": UserHasBioLink;
  "http://localhost:3000/@system-user/types/entity-type/has-service-account/v/1": UserHasServiceAccountLink;
  "http://localhost:3000/@system-user/types/entity-type/org-membership/v/1": UserOrgMembershipLink;
};

export type UserProperties = {
  /**
   * @minItems 1
   */
  "http://localhost:3000/@system-user/types/property-type/email/": [
    EmailPropertyValue,
    ...EmailPropertyValue[],
  ];
  "http://localhost:3000/@system-user/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/location/"?: LocationPropertyValue;
  /**
   * @maxItems 5
   */
  "http://localhost:3000/@system-user/types/property-type/pinned-entity-type-base-url/"?:
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
  "http://localhost:3000/@system-user/types/property-type/preferred-name/"?: PreferredNamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/shortname/"?: ShortnamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/website/"?: WebsitePropertyValue;
};

export type UserSecret = Entity<UserSecretProperties>;

export type UserSecretOutgoingLinkAndTarget = never;

export type UserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecretProperties = {
  "http://localhost:3000/@system-user/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/vault-path/": VaultPathPropertyValue;
};

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

/**
 * A URL for a website
 */
export type WebsitePropertyValue = TextDataType;
