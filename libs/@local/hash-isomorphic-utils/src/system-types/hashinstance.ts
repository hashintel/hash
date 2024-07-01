/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

import type { BooleanDataType, BooleanDataTypeWithMetadata } from "./shared";

export type { BooleanDataType, BooleanDataTypeWithMetadata };

export type HASHInstance = Entity<HASHInstanceProperties>;

export type HASHInstanceOutgoingLinkAndTarget = never;

export type HASHInstanceOutgoingLinksByLinkEntityTypeId = {};

/**
 * An instance of HASH.
 */
export type HASHInstanceProperties = {
  "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValue;
  "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValue;
};

export type HASHInstancePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValueWithMetadata;
  };
};

/**
 * Whether or not a user can self-register an org (note this does not apply to instance admins).
 */
export type OrgSelfRegistrationIsEnabledPropertyValue = BooleanDataType;

export type OrgSelfRegistrationIsEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether or not user functionality related to pages is enabled.
 */
export type PagesAreEnabledPropertyValue = BooleanDataType;

export type PagesAreEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether or not a user is able to register another user by inviting them to an org.
 */
export type UserRegistrationByInvitationIsEnabledPropertyValue =
  BooleanDataType;

export type UserRegistrationByInvitationIsEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * Whether or not user self registration (sign-up) is enabled.
 */
export type UserSelfRegistrationIsEnabledPropertyValue = BooleanDataType;

export type UserSelfRegistrationIsEnabledPropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;
