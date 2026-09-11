import { z } from "zod";

import {
  mutationActionInputSchemas,
  parameterSchema,
} from "@hashintel/petrinaut-core";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

export const batchedConstructionMode = "batched-construction";
export const mutatePetrinetToolName = "mutate_petrinet";

/** Per-operation attempt identity retained under one outer `mutate_petrinet` call. */
export const mutatePetrinetAttemptCallId = (
  toolCallId: string,
  operationId: string,
) => `${toolCallId}:${operationId}`;

/** Inverse of {@link mutatePetrinetAttemptCallId}; `undefined` when the attempt is not from this batch. */
export const mutatePetrinetAttemptOperationId = (
  toolCallId: string,
  attemptToolCallId: string,
): string | undefined => {
  const prefix = `${toolCallId}:`;
  return attemptToolCallId.startsWith(prefix)
    ? attemptToolCallId.slice(prefix.length)
    : undefined;
};

const operationIdSchema = z.string().min(1).meta({
  description:
    "Unique identity for this logical operation inside the batch. Distinct from later execution-attempt identities.",
});

const basisIdSchema = z.string().min(1).meta({
  description:
    "Must name one entry in `bases`. Several operations may share the same basisId.",
});

const rootAddPlaceInputSchema = mutationActionInputSchemas.addPlace.omit({
  targetSubnetId: true,
});

const rootAddTransitionInputSchema =
  mutationActionInputSchemas.addTransition.omit({
    targetSubnetId: true,
  });

// Zod 4.4.3 throws on `.omit()` here because addArc carries two `.check()`
// refinements. Rebuild from `.shape` and keep the output-arc type barrier.
const addArcShape = mutationActionInputSchemas.addArc.shape;
const rootAddArcInputSchema = z
  .strictObject({
    transitionId: addArcShape.transitionId,
    arcDirection: addArcShape.arcDirection,
    placeId: z.string().min(1).meta({
      description: "ID of a place in the root net.",
    }),
    weight: addArcShape.weight,
    type: addArcShape.type,
  })
  .check((ctx) => {
    const input = ctx.value;
    if (input.arcDirection === "output" && input.type !== undefined) {
      ctx.issues.push({
        code: "custom",
        path: ["type"],
        message:
          'Output arcs do not have an input arc type. Omit `type` when `arcDirection` is "output".',
        input: input.type,
      });
    }
  })
  .meta({ description: "Add an input or output arc to a transition." });

const rootRemovePlaceInputSchema = mutationActionInputSchemas.removePlace.omit({
  targetSubnetId: true,
});

const rootRemoveTransitionInputSchema =
  mutationActionInputSchemas.removeTransition.omit({
    targetSubnetId: true,
  });

const rootAddTypeInputSchema = mutationActionInputSchemas.addType.omit({
  targetSubnetId: true,
});

// Zod 4.4.3 throws on `.omit()` here because addParameter carries a
// default-value refinement. The root form is the parameter schema itself.
const rootAddParameterInputSchema = parameterSchema.meta({
  description: "Add a net-level parameter available to SDCPN code.",
});

const rootAddDifferentialEquationInputSchema =
  mutationActionInputSchemas.addDifferentialEquation.omit({
    targetSubnetId: true,
  });

const rootUpdateDifferentialEquationInputSchema =
  mutationActionInputSchemas.updateDifferentialEquation.omit({
    targetSubnetId: true,
  });

const removeArcShape = mutationActionInputSchemas.removeArc.shape;
const rootRemoveArcInputSchema = z
  .strictObject({
    transitionId: removeArcShape.transitionId,
    arcDirection: removeArcShape.arcDirection,
    placeId: z.string().min(1).meta({
      description: "ID of a place in the root net.",
    }),
  })
  .meta({ description: "Remove an input or output arc from a transition." });

const mutatePetrinetOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addPlace"),
    input: rootAddPlaceInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addTransition"),
    input: rootAddTransitionInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addArc"),
    input: rootAddArcInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removePlace"),
    input: rootRemovePlaceInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeTransition"),
    input: rootRemoveTransitionInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeArc"),
    input: rootRemoveArcInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addType"),
    input: rootAddTypeInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addParameter"),
    input: rootAddParameterInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addDifferentialEquation"),
    input: rootAddDifferentialEquationInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateDifferentialEquation"),
    input: rootUpdateDifferentialEquationInputSchema,
  }),
]);

/** Browser-safe selected batch carrier; execution remains split across Flue and the host. */
export const mutatePetrinetInputSchema = z
  .strictObject({
    observation: z
      .strictObject({
        toolCallId: z.string().min(1),
        baseHash: sha256Schema,
      })
      .meta({
        description:
          "The exact preceding getLatestNetDefinition browser result this batch cites. toolCallId is that call's id; baseHash is the independently observed definition hash from that result.",
      }),
    bases: z
      .array(
        z.strictObject({
          basisId: basisIdSchema,
          basis: declaredBasisSchema,
        }),
      )
      .min(1)
      .meta({
        description:
          "Deduplicated declared bases for this batch. Assign each a basisId here, then cite that id from every operation. Do not nest a basis object inside an operation.",
      }),
    operations: z.array(mutatePetrinetOperationSchema).min(1).max(30).meta({
      description:
        "Ordered flat operations. Each item is {operationId, basisId, type, input} — not {basisId, operation:{…}}. Commit sequentially; the first failed or unknown operation stops execution and every later operation is unattempted. The chunk is not a transaction: a successful prefix remains committed.",
    }),
  })
  .superRefine(({ bases, operations }, context) => {
    const basisIds = new Set<string>();
    for (const [index, { basisId }] of bases.entries()) {
      if (basisIds.has(basisId))
        context.addIssue({
          code: "custom",
          path: ["bases", index, "basisId"],
          message: "basisId must be unique",
        });
      basisIds.add(basisId);
    }
    const operationIds = new Set<string>();
    for (const [index, operation] of operations.entries()) {
      if (!basisIds.has(operation.basisId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "basisId"],
          message: "basisId must name a declared basis",
        });
      if (operationIds.has(operation.operationId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operationId"],
          message: "operationId must be unique",
        });
      operationIds.add(operation.operationId);
    }
  });

export type MutatePetrinetInput = z.output<typeof mutatePetrinetInputSchema>;
export type MutatePetrinetOperation = MutatePetrinetInput["operations"][number];

const mutationEffectSchema = z.intersection(
  z.strictObject({
    classification: z.enum(["direct", "derived"]),
    path: z.string(),
  }),
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("created"), after: z.unknown() }),
    z.strictObject({
      kind: z.literal("updated"),
      before: z.unknown(),
      after: z.unknown(),
    }),
    z.strictObject({ kind: z.literal("deleted"), before: z.unknown() }),
  ]),
);

const completedOutcomeFields = {
  index: z.number().int().nonnegative(),
  operationId: operationIdSchema,
  basisId: basisIdSchema,
  preHash: sha256Schema,
  postHash: sha256Schema,
};

const mutationOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("applied"),
    effects: z.array(mutationEffectSchema),
  }),
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("no-op"),
    effects: z.array(mutationEffectSchema),
  }),
  z.strictObject({
    ...completedOutcomeFields,
    status: z.literal("failed"),
    error: z.string(),
  }),
  z.strictObject({
    index: z.number().int().nonnegative(),
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    status: z.literal("unknown"),
    preHash: sha256Schema,
    postHash: sha256Schema.optional(),
    error: z.string(),
  }),
  z.strictObject({
    index: z.number().int().nonnegative(),
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    status: z.literal("unattempted"),
  }),
]);

/** Complete indexed browser result for one ordered mutation batch. */
export const mutatePetrinetOutputSchema = z
  .strictObject({
    execution: z.literal("ordered-stop"),
    toolCallId: z.string().min(1),
    observationToolCallId: z.string().min(1),
    preHash: sha256Schema,
    postHash: sha256Schema,
    outcomes: z.array(mutationOutcomeSchema).min(1),
  })
  .superRefine(({ outcomes }, context) => {
    outcomes.forEach(({ index }, position) => {
      if (index !== position)
        context.addIssue({
          code: "custom",
          path: ["outcomes", position, "index"],
          message: "outcome indices must be complete and ordered",
        });
    });
  });

export type MutatePetrinetOutput = z.output<typeof mutatePetrinetOutputSchema>;
