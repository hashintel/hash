/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type {
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

import type { BooleanDataType, BooleanDataTypeWithMetadata } from "./shared.js";

export type { BooleanDataType, BooleanDataTypeWithMetadata };

/**
 * An instance of HASH.
 */
export interface HASHInstance extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/hash-instance/v/1";
  properties: HASHInstanceProperties;
  propertiesWithMetadata: HASHInstancePropertiesWithMetadata;
}

export type HASHInstanceOutgoingLinkAndTarget = never;

export interface HASHInstanceOutgoingLinksByLinkEntityTypeId {}

/**
 * An instance of HASH.
 */
export interface HASHInstanceProperties extends PropertyObject {
  "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValue;
}

export interface HASHInstancePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HASHInstancePropertiesWithMetadataValue;
}

export interface HASHInstancePropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValueWithMetadata;
}

/**
 * Whether or not a user can self-register an org (note this does not apply to instance admins).
 */
export type OrgSelfRegistrationIsEnabledPropertyValue = BooleanDataType;

export interface OrgSelfRegistrationIsEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether or not user functionality related to pages is enabled.
 */
export type PagesAreEnabledPropertyValue = BooleanDataType;

export interface PagesAreEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether or not a user is able to register another user by inviting them to an org.
 */
export type UserRegistrationByInvitationIsEnabledPropertyValue =
  BooleanDataType;

export interface UserRegistrationByInvitationIsEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * Whether or not user self registration (sign-up) is enabled.
 */
export type UserSelfRegistrationIsEnabledPropertyValue = BooleanDataType;

export interface UserSelfRegistrationIsEnabledPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}
