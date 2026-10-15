import { validateBaseUrl } from "@blockprotocol/type-system";

import type { ActionStepCheck } from "./types.js";
import type { PropertyObject } from "@blockprotocol/type-system";

/**
 * Values for some of an entity's properties, keyed by property type base URL, e.g. to create an entity with or to
 * update one with. A list property's value is the whole list.
 *
 * Only the shape is checked when the flow is defined, because flows are validated without access to the ontology. The
 * values are checked against the entity type when the step runs.
 */
export type PropertyValues = PropertyObject;

/**
 * Checks the shape of property values, returning why it's invalid. Run when the flow is defined, and by the step when
 * it runs.
 */
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

  const invalidKey = keys.find((key) => validateBaseUrl(key).type !== "Ok");

  if (invalidKey !== undefined) {
    return `${JSON.stringify(invalidKey)} is not a property type base URL.`;
  }

  return undefined;
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
