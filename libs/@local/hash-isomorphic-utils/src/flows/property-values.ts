import { validateBaseUrl } from "@blockprotocol/type-system";

import type { ActionStepCheck } from "./types.js";
import type { BaseUrl, PropertyObject } from "@blockprotocol/type-system";

/**
 * Values for some of an entity's properties, keyed by property type base URL, e.g. to create an entity with or to
 * update one with. A list property's value is the whole list.
 *
 * Only the shape is checked when the flow is defined, because flows are validated without access to the ontology. The
 * values are checked against the entity type when the step runs.
 */
export type PropertyValues = PropertyObject;

const isPropertyBaseUrl = (value: unknown) =>
  typeof value === "string" && validateBaseUrl(value).type === "Ok";

/** Checks the shape of property values, returning why it's invalid. */
export const validatePropertyValues = (
  values: PropertyValues,
): string | undefined => {
  /* Persisted definitions and flow inputs may be malformed. */
  if (
    typeof values !== "object" ||
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    values === null ||
    Array.isArray(values)
  ) {
    return "Property values must be an object keyed by property type base URL.";
  }

  const keys = Object.keys(values);

  if (keys.length === 0) {
    return "Property values must give a value for at least one property.";
  }

  const invalidKey = keys.find((key) => !isPropertyBaseUrl(key));

  if (invalidKey !== undefined) {
    return `${JSON.stringify(invalidKey)} is not a property type base URL.`;
  }

  return undefined;
};

/** Checks a list of properties to remove from an entity, returning why it's invalid. */
export const validatePropertyRemovals = (
  baseUrls: BaseUrl[],
): string | undefined => {
  /* Persisted definitions and flow inputs may be malformed. */
  if (!Array.isArray(baseUrls)) {
    return "Properties to remove must be a list of property type base URLs.";
  }

  const invalidBaseUrl = baseUrls.find(
    (baseUrl) => !isPropertyBaseUrl(baseUrl),
  );

  if (invalidBaseUrl !== undefined) {
    return `${JSON.stringify(invalidBaseUrl)} is not a property type base URL.`;
  }

  return undefined;
};

const noChanges = "Give property values to set, properties to remove, or both.";

const setAndRemoved = (baseUrl: BaseUrl) =>
  `Property ${baseUrl} can't be both set and removed.`;

/**
 * Checks the changes an update makes to an entity: values to set, properties to remove, or both. Returns why they're
 * invalid.
 */
export const validatePropertyChanges = ({
  properties,
  removeProperties,
}: {
  properties?: PropertyValues;
  removeProperties?: BaseUrl[];
}): string | undefined => {
  if (properties === undefined && !removeProperties?.length) {
    return noChanges;
  }

  const error =
    (properties === undefined
      ? undefined
      : validatePropertyValues(properties)) ??
    (removeProperties === undefined
      ? undefined
      : validatePropertyRemovals(removeProperties));

  if (error) {
    return error;
  }

  const bothSetAndRemoved =
    properties &&
    removeProperties?.find((baseUrl) => Object.hasOwn(properties, baseUrl));

  return bothSetAndRemoved ? setAndRemoved(bothSetAndRemoved) : undefined;
};

/** Checks a step's constant `properties` input when the flow is defined. */
export const checkPropertyValuesInput: ActionStepCheck = ({ step, report }) => {
  const { properties } = step.inputs;

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    properties?.kind !== "constant" ||
    properties.payload.kind !== "PropertyValues"
  ) {
    return;
  }

  const error = validatePropertyValues(
    properties.payload.value as PropertyValues,
  );

  if (error) {
    report("properties", error);
  }
};

/**
 * Checks an Update entity step's inputs when the flow is defined: that it sets or removes something, and that its
 * constant `properties` and `removeProperties` are valid and don't name the same property.
 */
export const checkUpdateEntityInputs: ActionStepCheck = (params) => {
  const { step, report } = params;
  const { properties, removeProperties } = step.inputs;

  if (!properties && !removeProperties) {
    report("properties", noChanges);
    return;
  }

  checkPropertyValuesInput(params);

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    removeProperties?.kind !== "constant" ||
    removeProperties.payload.kind !== "BaseUrl"
  ) {
    return;
  }

  const baseUrls = removeProperties.payload.value as BaseUrl[];

  const removalsError = validatePropertyRemovals(baseUrls);

  if (removalsError) {
    report("removeProperties", removalsError);
    return;
  }

  if (!properties && baseUrls.length === 0) {
    report("removeProperties", noChanges);
    return;
  }

  const values =
    properties?.kind === "constant" &&
    properties.payload.kind === "PropertyValues" &&
    !validatePropertyValues(properties.payload.value as PropertyValues)
      ? (properties.payload.value as PropertyValues)
      : undefined;

  const bothSetAndRemoved =
    values && baseUrls.find((baseUrl) => Object.hasOwn(values, baseUrl));

  if (bothSetAndRemoved) {
    report("removeProperties", setAndRemoved(bothSetAndRemoved));
  }
};
