import type { BaseUrl } from "@blockprotocol/type-system";

/**
 * The base URL of the User entity type, used to detect user entities
 * when enforcing property update restrictions.
 */
export const userEntityTypeBaseUrl =
  "https://hash.ai/@h/types/entity-type/user/" as BaseUrl;

/**
 * Property base URLs on the User entity type that regular users are allowed to self-update.
 *
 * Any property not in this set is blocked from being updated via entity patch operations,
 * unless explicitly passed in `additionalAllowedPropertyBaseUrls`.
 *
 * Blocked properties include:
 * - shortname (set once during initial signup only – pass via additionalAllowedPropertyBaseUrls)
 * - email (managed via Kratos, not directly editable)
 * - kratosIdentityId (system-managed identity reference)
 * - enabledFeatureFlags (requires instance admin privileges – pass via additionalAllowedPropertyBaseUrls)
 */
export const userSelfUpdatablePropertyBaseUrls: ReadonlySet<BaseUrl> = new Set([
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/" as BaseUrl,
  "https://hash.ai/@h/types/property-type/application-preferences/" as BaseUrl,
  "https://hash.ai/@h/types/property-type/location/" as BaseUrl,
  "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/" as BaseUrl,
  "https://hash.ai/@h/types/property-type/preferred-pronouns/" as BaseUrl,
  "https://hash.ai/@h/types/property-type/website-url/" as BaseUrl,
]);

/**
 * The shortname property base URL, which can only be set once during account signup.
 */
export const shortnamePropertyBaseUrl =
  "https://hash.ai/@h/types/property-type/shortname/" as BaseUrl;

/**
 * The enabledFeatureFlags property base URL, which can only be changed by instance admins.
 */
export const enabledFeatureFlagsPropertyBaseUrl =
  "https://hash.ai/@h/types/property-type/enabled-feature-flags/" as BaseUrl;
