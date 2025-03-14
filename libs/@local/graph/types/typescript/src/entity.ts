import type {
  BaseUrl,
  JsonValue,
  Property,
  PropertyObjectWithMetadata,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";

export type BrandedPropertyObject<T extends Record<string, JsonValue>> = T & {
  [K in keyof T as Brand<K & Url, "BaseUrl">]: T[K];
};

// Helper function to create branded objects
export const brandPropertyObject = <T extends Record<string, JsonValue>>(
  obj: T,
): BrandedPropertyObject<T> => {
  return obj as BrandedPropertyObject<T>;
};

export type EntityProperties = {
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: Record<BaseUrl, Property>;
  propertiesWithMetadata: PropertyObjectWithMetadata;
};
