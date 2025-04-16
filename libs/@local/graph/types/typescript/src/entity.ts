import type { PropertyValue } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";

export type BrandedPropertyObject<T extends Record<string, PropertyValue>> =
  T & {
    [K in keyof T as Brand<K, "BaseUrl">]: T[K];
  };

// Helper function to create branded objects
export const brandPropertyObject = <T extends Record<string, PropertyValue>>(
  obj: T,
): BrandedPropertyObject<T> => {
  return obj as BrandedPropertyObject<T>;
};
