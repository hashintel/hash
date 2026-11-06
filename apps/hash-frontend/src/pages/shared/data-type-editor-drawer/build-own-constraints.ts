import { arraySchemaFromListConfig } from "./shared/list-config";

import type { ConstraintSchemaPart } from "./shared/constraint-config";
import type { ListConfig } from "./shared/list-config";
import type {
  SingleValueConstraints,
  SingleValueSchema,
} from "@blockprotocol/type-system";

/**
 * The edited type's own value constraints: the primary parent's primitive
 * when there are no lists, otherwise the list schemas — joined by `anyOf`
 * with the primitive when both are present, so every selected alternative
 * stays expressed on the type itself.
 *
 * A union-typed parent has no single primitive: its `anyOf` arms are
 * mirrored instead, so the type accepts what the parent it extends accepts.
 * Arms already expressed as a list entry are not mirrored again.
 */
export const buildOwnConstraints = ({
  primitive,
  unionArms,
  listEntries,
  constraintsPart,
}: {
  primitive: SingleValueConstraints["type"] | null;
  /** The primary parent's own `anyOf` arms, when it is a union type */
  unionArms?: SingleValueSchema[] | null;
  listEntries: { config: ListConfig }[];
  constraintsPart?: ConstraintSchemaPart | null;
}):
  | SingleValueSchema
  | { anyOf: [SingleValueSchema, ...SingleValueSchema[]] } => {
  const listArms = listEntries.map((entry) =>
    arraySchemaFromListConfig(entry.config),
  );
  const listArmKeys = new Set(listArms.map((arm) => JSON.stringify(arm)));
  const mirroredArms = (unionArms ?? []).filter(
    (arm) => !listArmKeys.has(JSON.stringify(arm)),
  );

  const arms: SingleValueSchema[] = [
    ...(primitive
      ? [{ type: primitive, ...(constraintsPart ?? {}) } as SingleValueSchema]
      : mirroredArms),
    ...listArms,
  ];

  if (arms.length === 0) {
    return { type: "string" };
  }
  if (arms.length === 1) {
    return arms[0]!;
  }
  return { anyOf: arms as [SingleValueSchema, ...SingleValueSchema[]] };
};
