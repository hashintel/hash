import type { BaseUrl, EntityPropertiesObject } from "@local/hash-subgraph";

/**
 * Property keys must end with a trailing slash, but the AI Model sometimes omits them.
 */
export const ensureTrailingSlash = (properties: EntityPropertiesObject) => {
  const newProperties: EntityPropertiesObject = {};
  for (const [key, value] of Object.entries(properties)) {
    const keyWithSlash = (key.endsWith("/") ? key : `${key}/`) as BaseUrl;
    newProperties[keyWithSlash] = value;
  }
  return newProperties;
};
