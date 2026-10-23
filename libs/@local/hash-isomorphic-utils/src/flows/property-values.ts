import {
  validateBaseUrl,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

import type { ActionStepCheck } from "./types.js";
import type {
  BaseUrl,
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
} from "@blockprotocol/type-system";

/*
 * Properties are given in the graph's own terms, so that the graph validates them when it saves the entity. Only their
 * shape is checked here, because flows are validated without access to the ontology.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPropertyBaseUrl = (value: unknown): value is BaseUrl =>
  typeof value === "string" && validateBaseUrl(value).type === "Ok";

/**
 * Whether a property gives the data type ID of each of its values, including in lists and property objects. Without
 * one, the graph infers it, which it can't do for a property that allows more than one data type, or only an abstract
 * one. As in the graph, a value is told apart from a list or property object by its metadata having a data type ID.
 */
const hasDataTypeIds = (property: unknown): boolean => {
  if (!isRecord(property)) {
    return false;
  }

  const { value, metadata } = property;

  if (isRecord(metadata) && Object.hasOwn(metadata, "dataTypeId")) {
    return (
      typeof metadata.dataTypeId === "string" &&
      validateVersionedUrl(metadata.dataTypeId).type === "Ok"
    );
  }

  if (Array.isArray(value)) {
    return value.every(hasDataTypeIds);
  }

  return isRecord(value) && Object.values(value).every(hasDataTypeIds);
};

const notABaseUrlMessage = (value: unknown) =>
  `${JSON.stringify(value)} is not a property type base URL.`;

const missingDataTypeIdsMessage = (baseUrl: BaseUrl) =>
  `Property ${baseUrl} must give the data type ID of each of its values.`;

/** Checks the shape of an entity's properties with their metadata, returning why it's invalid. */
export const validatePropertiesWithMetadata = (
  properties: PropertyObjectWithMetadata,
): string | undefined => {
  /* Persisted definitions and flow inputs may be malformed. */
  if (!isRecord(properties) || !isRecord(properties.value)) {
    return "Properties must be an object whose value is keyed by property type base URL.";
  }

  for (const [baseUrl, property] of Object.entries(properties.value)) {
    if (!isPropertyBaseUrl(baseUrl)) {
      return notABaseUrlMessage(baseUrl);
    }

    if (!hasDataTypeIds(property)) {
      return missingDataTypeIdsMessage(baseUrl);
    }
  }

  return undefined;
};

const patchOps: PropertyPatchOperation["op"][] = ["add", "remove", "replace"];

/**
 * Checks the shape of patches to an entity's properties, returning why they're invalid. Each patch changes a whole
 * property, and no two change the same one, so that applying them again if the step is retried leaves the same
 * properties: a patch inside a list could add an item twice, and replacing a property then removing it fails once
 * it's gone.
 */
export const validatePropertyPatches = (
  patches: PropertyPatchOperation[],
): string | undefined => {
  /* Persisted definitions and flow inputs may be malformed. */
  if (!Array.isArray(patches)) {
    return "Property patches must be a list.";
  }

  const patchedBaseUrls = new Set<BaseUrl>();

  for (const [index, patch] of patches.entries()) {
    const position = `Property patch ${index + 1}`;

    if (!isRecord(patch) || !patchOps.includes(patch.op)) {
      return `${position} must have an op of ${patchOps.join(", ")}.`;
    }

    const { path } = patch;
    const baseUrl: unknown = Array.isArray(path) ? path[0] : undefined;

    if (!isPropertyBaseUrl(baseUrl)) {
      return `${position} must have a path of a property type base URL.`;
    }

    if (path.length > 1) {
      return `${position} changes part of property ${baseUrl}, which isn't supported yet: give its whole value.`;
    }

    if (patchedBaseUrls.has(baseUrl)) {
      return `${position} changes property ${baseUrl} again: give one patch per property.`;
    }

    patchedBaseUrls.add(baseUrl);

    if (patch.op !== "remove" && !hasDataTypeIds(patch.property)) {
      return missingDataTypeIdsMessage(baseUrl);
    }
  }

  return undefined;
};

/** Checks a Create entity step's constant `properties` input when the flow is defined. */
export const checkPropertiesWithMetadataInput: ActionStepCheck = ({
  step,
  report,
}) => {
  const { properties } = step.inputs;

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    properties?.kind !== "constant" ||
    properties.payload.kind !== "PropertyObjectWithMetadata"
  ) {
    return;
  }

  const error = validatePropertiesWithMetadata(
    properties.payload.value as PropertyObjectWithMetadata,
  );

  if (error) {
    report("properties", error);
  }
};

/** Checks an Update entity step's constant `propertyPatches` input when the flow is defined. */
export const checkPropertyPatchesInput: ActionStepCheck = ({
  step,
  report,
}) => {
  const { propertyPatches } = step.inputs;

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    propertyPatches?.kind !== "constant" ||
    propertyPatches.payload.kind !== "PropertyPatch"
  ) {
    return;
  }

  const error = validatePropertyPatches(
    propertyPatches.payload.value as PropertyPatchOperation[],
  );

  if (error) {
    report("propertyPatches", error);
  }
};
