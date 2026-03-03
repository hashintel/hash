import type {
  ArrayMetadata,
  BaseUrl,
  ObjectMetadata,
  PropertyArrayMetadata,
  PropertyMetadata,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyValue,
  PropertyValueMetadata,
  PropertyWithMetadata,
} from "@blockprotocol/type-system";
import { isBaseUrl } from "@blockprotocol/type-system";

/**
 * Recursively extracts the raw property value from a PropertyWithMetadata.
 */
const extractPropertyValue = (
  propertyWithMetadata: PropertyWithMetadata,
): PropertyValue => {
  // Check if it's a value with metadata (has metadata.dataTypeId at the value level)
  if (
    "metadata" in propertyWithMetadata &&
    propertyWithMetadata.metadata &&
    typeof propertyWithMetadata.metadata === "object" &&
    "dataTypeId" in propertyWithMetadata.metadata
  ) {
    // This is a PropertyValueWithMetadata
    return propertyWithMetadata.value as PropertyValue;
  }

  // Check if it's an array
  if (Array.isArray(propertyWithMetadata.value)) {
    return propertyWithMetadata.value.map((element) =>
      extractPropertyValue(element as PropertyWithMetadata),
    ) as PropertyValue;
  }

  // Check if it's an object (PropertyObjectWithMetadata)
  if (
    typeof propertyWithMetadata.value === "object" &&
    propertyWithMetadata.value !== null
  ) {
    const entries = Object.entries(propertyWithMetadata.value);
    if (entries.length > 0 && entries.every(([key]) => isBaseUrl(key))) {
      // It's an object with BaseUrl keys, recurse into it
      return Object.fromEntries(
        entries.map(([key, value]) => [
          key,
          extractPropertyValue(value as PropertyWithMetadata),
        ]),
      ) as PropertyValue;
    }
  }

  // Fallback: treat as a raw value
  return propertyWithMetadata.value as PropertyValue;
};

/**
 * Recursively extracts the PropertyMetadata from a PropertyWithMetadata.
 */
const extractPropertyMetadata = (
  propertyWithMetadata: PropertyWithMetadata,
): PropertyMetadata => {
  // Check if it's a value with metadata (has metadata.dataTypeId at the value level)
  if (
    "metadata" in propertyWithMetadata &&
    propertyWithMetadata.metadata &&
    typeof propertyWithMetadata.metadata === "object" &&
    "dataTypeId" in propertyWithMetadata.metadata
  ) {
    // This is a PropertyValueWithMetadata
    return {
      metadata: propertyWithMetadata.metadata,
    } as PropertyValueMetadata;
  }

  // Check if it's an array
  if (Array.isArray(propertyWithMetadata.value)) {
    const result: PropertyArrayMetadata = {
      value: propertyWithMetadata.value.map((element) =>
        extractPropertyMetadata(element as PropertyWithMetadata),
      ),
    };

    // Add array-level metadata if present
    const arrayMetadata = (propertyWithMetadata as { metadata?: ArrayMetadata })
      .metadata;
    if (arrayMetadata) {
      result.metadata = arrayMetadata;
    }

    return result;
  }

  // Check if it's an object (PropertyObjectWithMetadata)
  if (
    typeof propertyWithMetadata.value === "object" &&
    propertyWithMetadata.value !== null
  ) {
    const entries = Object.entries(propertyWithMetadata.value);
    if (entries.length > 0 && entries.every(([key]) => isBaseUrl(key))) {
      // It's an object with BaseUrl keys
      const result: PropertyObjectMetadata = {
        value: Object.fromEntries(
          entries.map(([key, value]) => [
            key as BaseUrl,
            extractPropertyMetadata(value as PropertyWithMetadata),
          ]),
        ),
      };

      // Add object-level metadata if present
      const objectMetadata = (
        propertyWithMetadata as { metadata?: ObjectMetadata }
      ).metadata;
      if (objectMetadata) {
        result.metadata = objectMetadata;
      }

      return result;
    }
  }

  // Fallback: return value metadata with null dataTypeId
  return {
    metadata: { dataTypeId: null },
  } as PropertyValueMetadata;
};

/**
 * Splits a PropertyObjectWithMetadata into separate properties and propertyMetadata objects.
 *
 * This is the inverse of mergePropertyObjectAndMetadata.
 *
 * @param propertiesWithMetadata - The combined properties with metadata object
 * @returns An object containing separate properties and propertyMetadata
 */
export const splitPropertiesAndMetadata = (propertiesWithMetadata: {
  value: Record<BaseUrl, PropertyWithMetadata>;
  metadata?: ObjectMetadata;
}): {
  properties: PropertyObject;
  propertyMetadata: PropertyObjectMetadata;
} => {
  const properties: PropertyObject = {};
  const propertyMetadataValue: Record<BaseUrl, PropertyMetadata> = {};

  for (const [key, propertyWithMetadata] of Object.entries(
    propertiesWithMetadata.value,
  )) {
    const baseUrl = key as BaseUrl;
    properties[baseUrl] = extractPropertyValue(propertyWithMetadata);
    propertyMetadataValue[baseUrl] =
      extractPropertyMetadata(propertyWithMetadata);
  }

  const result: PropertyObjectMetadata = {
    value: propertyMetadataValue,
  };

  if (propertiesWithMetadata.metadata) {
    result.metadata = propertiesWithMetadata.metadata;
  }

  return {
    properties,
    propertyMetadata: result,
  };
};
