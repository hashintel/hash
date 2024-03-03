/**
 * This file was automatically generated – do not edit it.
 */

import { BooleanDataType } from "./shared";
import { Entity } from "@local/hash-subgraph";

export type { BooleanDataType };

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

/**
 * Whether or not a user can self-register an org (note this does not apply to instance admins).
 */
export type OrgSelfRegistrationIsEnabledPropertyValue = BooleanDataType;

/**
 * Whether or not user functionality related to pages is enabled.
 */
export type PagesAreEnabledPropertyValue = BooleanDataType;

/**
 * Whether or not a user is able to register another user by inviting them to an org.
 */
export type UserRegistrationByInvitationIsEnabledPropertyValue =
  BooleanDataType;

/**
 * Whether or not user self registration (sign-up) is enabled.
 */
export type UserSelfRegistrationIsEnabledPropertyValue = BooleanDataType;
