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
export type DescriptionPropertyValue = TextDataType;

export type EmailPropertyValue = TextDataType;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

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
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type Org = Entity<OrgProperties>;

export type OrgMembership = Entity<OrgMembershipProperties> & {
  linkData: LinkData;
};

export type OrgMembershipOutgoingLinkAndTarget = never;

export type OrgMembershipOutgoingLinksByLinkEntityTypeId = {};

export type OrgMembershipProperties = OrgMembershipProperties1 &
  OrgMembershipProperties2;
export type OrgMembershipProperties1 = LinkProperties;

export type OrgMembershipProperties2 = {};

export type OrgOutgoingLinkAndTarget = never;

export type OrgOutgoingLinksByLinkEntityTypeId = {};

export type OrgProperties = {
  "http://localhost:3000/@system-user/types/property-type/description/"?: DescriptionPropertyValue;
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

export type UserOrgMembershipLink = {
  linkEntity: OrgMembership;
  rightEntity: Org;
};

export type UserOutgoingLinkAndTarget = UserOrgMembershipLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
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
