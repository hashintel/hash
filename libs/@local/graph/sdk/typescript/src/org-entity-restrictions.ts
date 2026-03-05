import type { BaseUrl } from "@blockprotocol/type-system";

import { nameIsInvalid } from "./validate-name.js";

/**
 * The base URL of the Organization entity type, used to detect org entities
 * when enforcing property update restrictions.
 */
export const organizationEntityTypeBaseUrl =
  "https://hash.ai/@h/types/entity-type/organization/" as BaseUrl;

/**
 * The base URL of the organization-name property type.
 */
export const organizationNamePropertyBaseUrl =
  "https://hash.ai/@h/types/property-type/organization-name/" as BaseUrl;

/**
 * Validates an organization name. Returns `true` if the name is valid,
 * or an error message string if it is invalid.
 */
export const orgNameIsInvalid = (orgName: string): string | true =>
  nameIsInvalid(orgName, "Organization name");
