/**
 * Constraints: boolean conditions authored as TypeScript and carried as
 * serialized HIR, so every consumer (the editors, the CLI, the Python
 * binding) reads one shared expression representation without a TypeScript
 * frontend of its own.
 *
 * Two shapes, discriminated by `space`:
 * - a **parameter** constraint ranges over the parameter space: one
 *   expression over `scenario.*` and `parameters.*`, lowered on the
 *   `scenario-expression` surface with a boolean expected type. It is
 *   checkable before anything runs.
 * - a **state** constraint ranges over the simulation state: a metric-shaped
 *   body over `state`, lowered on the `metric` surface and checked to return
 *   boolean. It is observed while a run goes.
 *
 * A constraint belongs to whatever carries it (today the optimization
 * manifest); this module owns the shape, not the placement. Nothing enforces
 * constraints yet: they are declared, validated, and evaluable.
 *
 * @layerRoot core.constraints
 * @role Boolean conditions over the parameter space or the simulation state, authored as TypeScript, carried as HIR, and shaped once for every consumer
 */

import { z } from "zod";

import { hirFunctionSchema } from "../hir/hir-schema";

import type { HirSurfaceKind } from "../hir/hir";

export const CONSTRAINT_SPACES = ["parameters", "state"] as const;

export const constraintSpaceSchema = z.enum(CONSTRAINT_SPACES).meta({
  id: "ConstraintSpace",
  description:
    "What a constraint ranges over: the parameter space (`parameters`) or the simulation state (`state`).",
});

export type ConstraintSpace = (typeof CONSTRAINT_SPACES)[number];

/** The HIR surface each space lowers on. */
export const CONSTRAINT_SURFACES = {
  parameters: "scenario-expression",
  state: "metric",
} as const satisfies Record<ConstraintSpace, HirSurfaceKind>;

const constraintBaseShape = {
  id: z.string().min(1),
  name: z.string().trim().min(1).optional().meta({
    description:
      "Optional display name shown wherever the constraint is reported.",
  }),
  code: z.string().trim().min(1).meta({
    description:
      "The authored TypeScript source, the editable text of record. `hir` is its lowered form; regenerating `hir` from `code` must be a no-op.",
  }),
};

export const parameterConstraintSchema = z
  .strictObject({
    space: z.literal("parameters"),
    ...constraintBaseShape,
    hir: hirFunctionSchema
      .extend({ surface: z.literal(CONSTRAINT_SURFACES.parameters) })
      .meta({
        id: "ParameterConstraintHir",
        description:
          "The lowered condition: a `scenario-expression` surface function with no declared parameters; `scenario.*` and `parameters.*` are ambient reads.",
      }),
  })
  .meta({
    id: "ParameterConstraint",
    description:
      "One boolean condition over the parameter space: an expression over `scenario.*` and `parameters.*`, e.g. `scenario.min_load < scenario.max_load`. Checkable before a run starts.",
  });

export const stateConstraintSchema = z
  .strictObject({
    space: z.literal("state"),
    ...constraintBaseShape,
    hir: hirFunctionSchema
      .extend({ surface: z.literal(CONSTRAINT_SURFACES.state) })
      .meta({
        id: "StateConstraintHir",
        description:
          "The lowered condition: a `metric` surface function whose first declared parameter is the simulation `state`; `parameters.*` is ambient.",
      }),
  })
  .meta({
    id: "StateConstraint",
    description:
      "One boolean condition over the simulation state, authored like a metric body but returning boolean, e.g. `return state.places.Queue.count <= 10;`. Observed while a run goes.",
  });

export const constraintSchema = z
  .discriminatedUnion("space", [
    parameterConstraintSchema,
    stateConstraintSchema,
  ])
  .meta({
    id: "Constraint",
    description:
      "One boolean condition, discriminated by the space it ranges over.",
  });

/** A set of constraints with unique ids across both spaces. */
export const constraintListSchema = z
  .array(constraintSchema)
  .superRefine((constraints, context) => {
    const seen = new Set<string>();
    for (const [index, constraint] of constraints.entries()) {
      if (seen.has(constraint.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate constraint id "${constraint.id}"`,
        });
      }
      seen.add(constraint.id);
    }
  })
  .meta({
    description:
      "Boolean conditions over the parameter space and the simulation state, ids unique across the list.",
  });

export type ParameterConstraint = z.infer<typeof parameterConstraintSchema>;
export type StateConstraint = z.infer<typeof stateConstraintSchema>;
export type Constraint = z.infer<typeof constraintSchema>;

/** The constraints of one space, typed by that space. */
export function constraintsInSpace<S extends ConstraintSpace>(
  constraints: readonly Constraint[],
  space: S,
): Extract<Constraint, { space: S }>[] {
  return constraints.filter(
    (constraint): constraint is Extract<Constraint, { space: S }> =>
      constraint.space === space,
  );
}
