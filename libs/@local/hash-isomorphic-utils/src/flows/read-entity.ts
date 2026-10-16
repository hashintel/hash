import { validateSubject } from "./filter-condition.js";

import type { ConditionSubject } from "./filter-condition.js";
import type { ActionStepCheck, PayloadKind } from "./types.js";

/** The kinds Read entity can read a property as. */
export const readEntityKinds = [
  "Text",
  "Number",
  "Boolean",
  "Date",
] as const satisfies readonly PayloadKind[];

export type ReadEntityKind = (typeof readEntityKinds)[number];

/**
 * A property of an entity to read, and the kind its value has: a Filter condition's entity property subject, of one of
 * the {@link readEntityKinds}.
 *
 * The kind is declared rather than looked up, because flows are validated without access to the ontology. Read entity
 * checks the value has it when it runs.
 */
export type EntityProperty = Extract<
  ConditionSubject,
  { kind: "entityProperty" }
> & { payloadKind: ReadEntityKind };

/** Checks that the property a Read entity step reads is an entity property subject, returning why it isn't. */
const validatePropertySubject = (
  property: EntityProperty,
): string | undefined => {
  /*
   * Checked first, so that another subject isn't reported for what it lacks as that subject. Persisted definitions
   * may be malformed.
   */
  if ((property as ConditionSubject | null)?.kind !== "entityProperty") {
    return "The property to read must be an entity property subject.";
  }
  return validateSubject(property, "EntityId");
};

/** Checks the property a Read entity step reads, and the kind it's read as, returning why it's invalid. */
export const validateEntityProperty = (
  property: EntityProperty,
): string | undefined => {
  const subjectError = validatePropertySubject(property);
  if (subjectError) {
    return subjectError;
  }
  if (
    !(readEntityKinds as readonly PayloadKind[]).includes(property.payloadKind)
  ) {
    return `A property can only be read as ${readEntityKinds.join(", ")}.`;
  }
  return undefined;
};

/**
 * Checks a Read entity step's constant `property` input when the flow is defined. That it is a constant declaring one
 * of the {@link readEntityKinds} is checked with every output whose kind an input declares (see `KindDeclaredBy`).
 */
export const checkReadEntityInputs: ActionStepCheck = ({ step, report }) => {
  const { property } = step.inputs;

  /* A constant of another kind is reported as an incompatible connection. */
  if (
    property?.kind !== "constant" ||
    property.payload.kind !== "EntityProperty"
  ) {
    return;
  }

  const error = validatePropertySubject(
    property.payload.value as EntityProperty,
  );

  if (error) {
    report("property", error);
  }
};
