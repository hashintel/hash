import type {
  PropertyArrayMetadata,
  PropertyArrayWithMetadata,
  PropertyMetadata,
  PropertyObjectMetadata,
  PropertyObjectWithMetadata,
  PropertyValueMetadata,
  PropertyValueWithMetadata,
  PropertyWithMetadata,
} from "@blockprotocol/type-system-rs";

export const ENTITY_ID_DELIMITER = "~";

export const isValueMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyValueMetadata =>
  !!metadata.metadata && "dataTypeId" in metadata.metadata;

export const isArrayMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyArrayMetadata =>
  !isValueMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyObjectMetadata =>
  !isValueMetadata(metadata) && !Array.isArray(metadata.value);

export const isValueWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyValueWithMetadata =>
  metadata.metadata !== undefined && "dataTypeId" in metadata.metadata;

export const isArrayWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyArrayWithMetadata =>
  !isValueWithMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyObjectWithMetadata =>
  !isValueWithMetadata(metadata) && !Array.isArray(metadata.value);
