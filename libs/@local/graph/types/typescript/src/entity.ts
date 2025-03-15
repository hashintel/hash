import type {
  PropertyObject,
  PropertyObjectWithMetadata,
  PropertyValue,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";

export type BrandedPropertyObject<T extends Record<string, PropertyValue>> =
  T & {
    [K in keyof T as Brand<K & Url, "BaseUrl">]: T[K];
  };

// Helper function to create branded objects
export const brandPropertyObject = <T extends Record<string, PropertyValue>>(
  obj: T,
): BrandedPropertyObject<T> => {
  return obj as BrandedPropertyObject<T>;
};

export type EntityProperties = {
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObject;
  propertiesWithMetadata: PropertyObjectWithMetadata;
};
