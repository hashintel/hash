import { arraySchemaFromListConfig } from "../list-util";

import type { ConstraintSchemaPart } from "../constraint-util";
import type { ListConfig } from "../list-util";
import type {
  SingleValueConstraints,
  SingleValueSchema,
} from "@blockprotocol/type-system";

/**
 * The edited type's own value constraints: the primary parent's primitive
 * when there are no lists, otherwise the list schemas — joined by `anyOf`
 * with the primitive when both are present, so every selected alternative
 * stays expressed on the type itself.
 */
export const buildOwnConstraints = ({
  primitive,
  listEntries,
  constraintsPart,
}: {
  primitive: SingleValueConstraints["type"] | null;
  listEntries: { config: ListConfig }[];
  constraintsPart?: ConstraintSchemaPart | null;
}):
  | SingleValueSchema
  | { anyOf: [SingleValueSchema, ...SingleValueSchema[]] } => {
  const listArms = listEntries.map((entry) =>
    arraySchemaFromListConfig(entry.config),
  );
  // An array-typed parent's bare `{ type: "array" }` arm would sit beside
  // the configured list arms and admit any array, voiding their constraints —
  // the list arms already express the array alternatives
  const primitiveArm =
    primitive && !(primitive === "array" && listArms.length > 0)
      ? [{ type: primitive, ...(constraintsPart ?? {}) } as SingleValueSchema]
      : [];

  const arms: SingleValueSchema[] = [...primitiveArm, ...listArms];

  if (arms.length === 0) {
    return { type: "string" };
  }
  if (arms.length === 1) {
    return arms[0]!;
  }
  return { anyOf: arms as [SingleValueSchema, ...SingleValueSchema[]] };
};
