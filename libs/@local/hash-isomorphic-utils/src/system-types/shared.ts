/**
 * This file was automatically generated – do not edit it.
 */

import { Entity, LinkData } from "@blockprotocol/graph";

export type Block = Entity<BlockProperties>;

export type BlockBlockDataLink = { linkEntity: BlockData; rightEntity: Entity };

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

export type ComponentIdPropertyValue = TextDataType;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

/**
 * A textual description of something
 */
export type Description0PropertyValue = TextDataType;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type Description1PropertyValue = TextDataType;

/**
 * A human-friendly display namae for something
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
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: Description1PropertyValue;
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

export type HasAvatar = Entity<HasAvatarProperties> & { linkData: LinkData };

export type HasAvatarOutgoingLinkAndTarget = never;

export type HasAvatarOutgoingLinksByLinkEntityTypeId = {};

/**
 * The avatar something has
 */
export type HasAvatarProperties = HasAvatarProperties1 & HasAvatarProperties2;
export type HasAvatarProperties1 = LinkProperties;

export type HasAvatarProperties2 = {};

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

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type Org = Entity<OrgProperties>;

export type OrgHasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: RemoteImageFile;
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

export type OrgOutgoingLinkAndTarget = OrgHasAvatarLink;

export type OrgOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/has-avatar/v/1": OrgHasAvatarLink;
};

export type OrgProperties = {
  "http://localhost:3000/@system-user/types/property-type/description/"?: Description0PropertyValue;
  "http://localhost:3000/@system-user/types/property-type/location/"?: LocationPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/organization-name/": OrganizationNamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/organization-provided-information/"?: OrganizationProvidedInformationPropertyValue;
  "http://localhost:3000/@system-user/types/property-type/shortname/": ShortnamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/website/"?: WebsitePropertyValue;
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

export type Parent = Entity<ParentProperties> & { linkData: LinkData };

export type ParentOutgoingLinkAndTarget = never;

export type ParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent of something.
 */
export type ParentProperties = ParentProperties1 & ParentProperties2;
export type ParentProperties1 = LinkProperties;

export type ParentProperties2 = {};

export type PreferredNamePropertyValue = TextDataType;

export type RemoteFile = Entity<RemoteFileProperties>;

export type RemoteFileOutgoingLinkAndTarget = never;

export type RemoteFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about a file hosted at a remote URL.
 */
export type RemoteFileProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: Description1PropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
};

export type RemoteImageFile = Entity<RemoteImageFileProperties>;

export type RemoteImageFileOutgoingLinkAndTarget = never;

export type RemoteImageFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * Information about an image file hosted at a remote URL.
 */
export type RemoteImageFileProperties = RemoteImageFileProperties1 &
  RemoteImageFileProperties2;
export type RemoteImageFileProperties1 = RemoteFileProperties;

export type RemoteImageFileProperties2 = {};

/**
 * A unique identifier for something, in the form of a slug
 */
export type ShortnamePropertyValue = TextDataType;

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

export type TokensPropertyValue = ObjectDataType;

export type User = Entity<UserProperties>;

export type UserHasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: RemoteImageFile;
};

export type UserOrgMembershipLink = {
  linkEntity: OrgMembership;
  rightEntity: Org;
};

export type UserOutgoingLinkAndTarget =
  | UserHasAvatarLink
  | UserOrgMembershipLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "http://localhost:3000/@system-user/types/entity-type/has-avatar/v/1": UserHasAvatarLink;
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
  "http://localhost:3000/@system-user/types/property-type/preferred-name/"?: PreferredNamePropertyValue;
  "http://localhost:3000/@system-user/types/property-type/shortname/"?: ShortnamePropertyValue;
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
