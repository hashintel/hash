/**
 * This file was automatically generated – do not edit it.
 */

import type { ArrayMetadata, ObjectMetadata } from "@blockprotocol/type-system";

import type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * An instance of HASH.
 */
export type HASHInstance = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/hash-instance/v/2"];
  properties: HASHInstanceProperties;
  propertiesWithMetadata: HASHInstancePropertiesWithMetadata;
};

export type HASHInstanceOutgoingLinkAndTarget = never;

export type HASHInstanceOutgoingLinksByLinkEntityTypeId = {};

/**
 * An instance of HASH.
 */
export type HASHInstanceProperties = {
  "https://hash.ai/@h/types/property-type/migration-state/"?: MigrationStatePropertyValue;
  "https://hash.ai/@h/types/property-type/migrations-completed/"?: MigrationsCompletedPropertyValue;
  "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValue;
  "https://hash.ai/@h/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValue;
  "https://hash.ai/@h/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValue;
  "https://hash.ai/@h/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValue;
};

export type HASHInstancePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/migration-state/"?: MigrationStatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/migrations-completed/"?: MigrationsCompletedPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/org-self-registration-is-enabled/": OrgSelfRegistrationIsEnabledPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/pages-are-enabled/": PagesAreEnabledPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/user-registration-by-invitation-is-enabled/": UserRegistrationByInvitationIsEnabledPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/user-self-registration-is-enabled/": UserSelfRegistrationIsEnabledPropertyValueWithMetadata;
  };
};

/**
 * The accumulated state of type versions from running migrations, stored as a JSON object.
 */
export type MigrationStatePropertyValue = ObjectDataType;

export type MigrationStatePropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * The migrations that have been completed for this instance
 */
export type MigrationsCompletedPropertyValue = TextDataType[];

export type MigrationsCompletedPropertyValueWithMetadata = {
  value: TextDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
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
