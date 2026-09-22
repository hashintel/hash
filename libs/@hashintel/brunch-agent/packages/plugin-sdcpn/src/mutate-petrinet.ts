import { z } from "zod";

import {
  mutationActionInputSchemas,
  parameterSchema,
} from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { declaredBasisSchema, sha256Schema } from "./declared-basis";

export const batchedConstructionMode = "batched-construction";
export const mutatePetrinautNetToolName = "mutate_petrinaut_net";

export const isMutatePetrinautNetToolName = (name: string): boolean =>
  name === mutatePetrinautNetToolName;

/** Per-operation attempt identity retained under one outer `mutate_petrinaut_net` call. */
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

// Edits to existing parts of the net. Each names the part by ID and carries
// only the fields to change; canvas positions stay with layout.
const rootUpdatePlaceInputSchema = mutationActionInputSchemas.updatePlace.omit({
  targetSubnetId: true,
});

const rootUpdateTransitionInputSchema =
  mutationActionInputSchemas.updateTransition.omit({
    targetSubnetId: true,
  });

// Both arc updates carry the single-endpoint `.check()`; rebuild from `.shape`
// as addArc does and keep the root-place endpoint only.
const updateArcWeightShape = mutationActionInputSchemas.updateArcWeight.shape;
const rootUpdateArcWeightInputSchema = z
  .strictObject({
    transitionId: updateArcWeightShape.transitionId,
    arcDirection: updateArcWeightShape.arcDirection,
    placeId: z.string().min(1).meta({
      description: "ID of a place in the root net.",
    }),
    weight: updateArcWeightShape.weight,
  })
  .meta({ description: "Update the token weight on an existing arc." });

const updateArcTypeShape = mutationActionInputSchemas.updateArcType.shape;
const rootUpdateArcTypeInputSchema = z
  .strictObject({
    transitionId: updateArcTypeShape.transitionId,
    placeId: z.string().min(1).meta({
      description: "ID of a place in the root net.",
    }),
    type: updateArcTypeShape.type,
  })
  .meta({
    description:
      "Update an existing input arc's type (standard, read or inhibitor).",
  });

const rootUpdateTypeInputSchema = mutationActionInputSchemas.updateType.omit({
  targetSubnetId: true,
});

const rootAddTypeElementInputSchema =
  mutationActionInputSchemas.addTypeElement.omit({
    targetSubnetId: true,
  });

const rootUpdateTypeElementInputSchema =
  mutationActionInputSchemas.updateTypeElement.omit({
    targetSubnetId: true,
  });

const rootUpdateParameterInputSchema =
  mutationActionInputSchemas.updateParameter.omit({
    targetSubnetId: true,
  });

// Removals of net-level state; Petrinaut clears the references they leave.
const rootRemoveTypeInputSchema = mutationActionInputSchemas.removeType.omit({
  targetSubnetId: true,
});

const rootRemoveTypeElementInputSchema =
  mutationActionInputSchemas.removeTypeElement.omit({
    targetSubnetId: true,
  });

const rootRemoveParameterInputSchema =
  mutationActionInputSchemas.removeParameter.omit({
    targetSubnetId: true,
  });

const rootRemoveDifferentialEquationInputSchema =
  mutationActionInputSchemas.removeDifferentialEquation.omit({
    targetSubnetId: true,
  });

// Scenarios and metrics live on the root net only, so the canonical inputs
// carry no targetSubnetId and are used as they are. Scenario parameters are
// the tunable quantities an experiment varies; a count is an `integer` type.
const rootAddScenarioInputSchema = mutationActionInputSchemas.addScenario;
const rootUpdateScenarioInputSchema = mutationActionInputSchemas.updateScenario;
const rootRemoveScenarioInputSchema = mutationActionInputSchemas.removeScenario;
const rootAddMetricInputSchema = mutationActionInputSchemas.addMetric;
const rootUpdateMetricInputSchema = mutationActionInputSchemas.updateMetric;
const rootRemoveMetricInputSchema = mutationActionInputSchemas.removeMetric;

const mutatePetrinetOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addPlace"),
    input: rootAddPlaceInputSchema.meta(
      mutationActionInputSchemas.addPlace.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addTransition"),
    input: rootAddTransitionInputSchema.meta(
      mutationActionInputSchemas.addTransition.meta() ?? {},
    ),
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
    input: rootRemovePlaceInputSchema.meta(
      mutationActionInputSchemas.removePlace.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeTransition"),
    input: rootRemoveTransitionInputSchema.meta(
      mutationActionInputSchemas.removeTransition.meta() ?? {},
    ),
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
    input: rootAddTypeInputSchema.meta(
      mutationActionInputSchemas.addType.meta() ?? {},
    ),
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
    input: rootAddDifferentialEquationInputSchema.meta(
      mutationActionInputSchemas.addDifferentialEquation.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateDifferentialEquation"),
    input: rootUpdateDifferentialEquationInputSchema.meta(
      mutationActionInputSchemas.updateDifferentialEquation.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updatePlace"),
    input: rootUpdatePlaceInputSchema.meta(
      mutationActionInputSchemas.updatePlace.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateTransition"),
    input: rootUpdateTransitionInputSchema.describe(
      "Update a transition's name, description, metadata or executable code. Change connections with the arc operations, not this update object.",
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateArcWeight"),
    input: rootUpdateArcWeightInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateArcType"),
    input: rootUpdateArcTypeInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateType"),
    input: rootUpdateTypeInputSchema.meta(
      mutationActionInputSchemas.updateType.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addTypeElement"),
    input: rootAddTypeElementInputSchema.meta(
      mutationActionInputSchemas.addTypeElement.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateTypeElement"),
    input: rootUpdateTypeElementInputSchema.meta(
      mutationActionInputSchemas.updateTypeElement.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateParameter"),
    input: rootUpdateParameterInputSchema.meta(
      mutationActionInputSchemas.updateParameter.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeType"),
    input: rootRemoveTypeInputSchema.meta(
      mutationActionInputSchemas.removeType.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeTypeElement"),
    input: rootRemoveTypeElementInputSchema.meta(
      mutationActionInputSchemas.removeTypeElement.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeParameter"),
    input: rootRemoveParameterInputSchema.meta(
      mutationActionInputSchemas.removeParameter.meta() ?? {},
    ),
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeDifferentialEquation"),
    input: rootRemoveDifferentialEquationInputSchema.meta(
      mutationActionInputSchemas.removeDifferentialEquation.meta() ?? {},
    ),
  }),
  // Simulation scenarios and metrics: the saved entities an experiment names.
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addScenario"),
    input: rootAddScenarioInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateScenario"),
    input: rootUpdateScenarioInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeScenario"),
    input: rootRemoveScenarioInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("addMetric"),
    input: rootAddMetricInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("updateMetric"),
    input: rootUpdateMetricInputSchema,
  }),
  z.strictObject({
    operationId: operationIdSchema,
    basisId: basisIdSchema,
    type: z.literal("removeMetric"),
    input: rootRemoveMetricInputSchema,
  }),
]);

/** Browser-safe selected batch carrier; execution remains split across Flue and the host. */
export const mutatePetrinetInputSchema = z
  .strictObject({
    observation: z
      .strictObject({
        toolCallId: z
          .string()
          .min(1)
          .describe(
            "Copy output.observation.toolCallId from the preceding read_petrinaut_net browser result.",
          ),
        baseHash: sha256Schema.describe(
          "Copy output.observation.sha256 from that same read. This is the net-definition hash, not a workpiece hash; never calculate or guess it.",
        ),
      })
      .meta({
        description:
          "The exact preceding read_petrinaut_net browser result this batch cites. toolCallId is that call's id; baseHash is the independently observed definition hash from that result.",
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

/** Interface B's browser-executed, bounded construction carrier. */
export const applyPetrinautConstructionToolName =
  "apply_petrinaut_construction";

export const APPLY_PETRINAUT_CONSTRUCTION_TOOL_NAMES = [
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

const constructionText = z.string().min(1);
const constructionOperationFields = {
  operationId: constructionText
    .max(128)
    .describe(
      "Stable identity for this intended operation within this construction request.",
    ),
  intendedEffect: constructionText
    .max(1000)
    .describe(
      "The intended semantic change, stated as intention rather than an observed result.",
    ),
  intendedTarget: constructionText
    .max(500)
    .describe(
      "The semantic thing this operation is intended to create or connect.",
    ),
  expectedImpact: z
    .array(constructionText.max(500))
    .min(1)
    .max(8)
    .superRefine((impacts, context) => {
      const seen = new Set<string>();
      for (const [index, impact] of impacts.entries()) {
        if (seen.has(impact))
          context.addIssue({
            code: "custom",
            path: [index],
            message: "Expected impacts must be distinct",
          });
        seen.add(impact);
      }
    })
    .describe(
      "Distinct, bounded semantic definitions expected to change. These are expectations, not observed effects.",
    ),
  evidence: z
    .strictObject({
      excerpts: z
        .array(constructionText.max(4096))
        .min(1)
        .max(8)
        .superRefine((excerpts, context) => {
          const seen = new Set<string>();
          for (const [index, excerpt] of excerpts.entries()) {
            if (seen.has(excerpt))
              context.addIssue({
                code: "custom",
                path: [index],
                message: "Ledger excerpts must be distinct",
              });
            seen.add(excerpt);
          }
        })
        .describe(
          "Literal passages copied exactly from current Ledger history. The browser host resolves them against the current settled Ledger.",
        ),
      rationale: constructionText
        .max(2000)
        .describe(
          "Why the literal passages support this intended operation, without claiming that it happened.",
        ),
    })
    .optional()
    .describe(
      "Optional literal Ledger support. Omit this when no exact passage supports the intended operation.",
    ),
};

const applyPetrinautConstructionOperationSchema = z.discriminatedUnion(
  "toolName",
  [
    z.strictObject({
      ...constructionOperationFields,
      toolName: z.literal("addPlace"),
      input: petrinautAiTools.addPlace.inputSchema,
    }),
    z.strictObject({
      ...constructionOperationFields,
      toolName: z.literal("addTransition"),
      input: petrinautAiTools.addTransition.inputSchema,
    }),
    z.strictObject({
      ...constructionOperationFields,
      toolName: z.literal("addArc"),
      input: petrinautAiTools.addArc.inputSchema,
    }),
  ],
);

/** Model-authored intent only; browser/document and Ledger protocol state is host-owned. */
export const applyPetrinautConstructionInputSchema = z
  .strictObject({
    operations: z
      .array(applyPetrinautConstructionOperationSchema)
      .min(1)
      .max(3)
      .describe(
        "One to three canonical Petrinaut operations in dependency order. The browser host executes them in this exact order and stops at the first failure.",
      ),
    layout: z
      .strictObject({
        requested: z
          .literal(true)
          .describe(
            "Explicitly request automatic layout after the successful prefix, when its applied structural changes make layout relevant.",
          ),
      })
      .optional()
      .describe(
        "Optional automatic-layout request. Omit it to leave layout unchanged; use the canonical layout tool when user confirmation is required.",
      ),
  })
  .superRefine(({ operations }, context) => {
    const operationIds = new Set<string>();
    let previousToolRank = -1;
    for (const [index, { operationId, toolName }] of operations.entries()) {
      if (operationIds.has(operationId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operationId"],
          message: "operationId must be unique",
        });
      operationIds.add(operationId);

      const toolRank =
        APPLY_PETRINAUT_CONSTRUCTION_TOOL_NAMES.indexOf(toolName);
      if (toolRank < previousToolRank)
        context.addIssue({
          code: "custom",
          path: ["operations", index, "toolName"],
          message:
            "Operations must be ordered addPlace, then addTransition, then addArc",
        });
      previousToolRank = toolRank;
    }
  });

export type ApplyPetrinautConstructionInput = z.output<
  typeof applyPetrinautConstructionInputSchema
>;

const constructionObservedEffectSchema = z.strictObject({
  kind: z.enum(["created", "updated", "deleted", "derived"]),
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

const constructionOutcomeIdentity = {
  index: z.number().int().nonnegative(),
  operationId: constructionText,
  toolName: z.enum(APPLY_PETRINAUT_CONSTRUCTION_TOOL_NAMES),
};

const applyPetrinautConstructionOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...constructionOutcomeIdentity,
    status: z.literal("applied"),
    effects: z.array(constructionObservedEffectSchema),
  }),
  z.strictObject({
    ...constructionOutcomeIdentity,
    status: z.literal("no-op"),
    effects: z.array(constructionObservedEffectSchema),
  }),
  z.strictObject({
    ...constructionOutcomeIdentity,
    status: z.literal("failed"),
    error: z.string(),
  }),
  z.strictObject({
    ...constructionOutcomeIdentity,
    status: z
      .literal("unknown")
      .describe(
        "The operation may have changed live document state, but durable or independently verifiable standing could not be established.",
      ),
    error: z.string(),
  }),
  z.strictObject({
    ...constructionOutcomeIdentity,
    status: z.literal("unattempted"),
  }),
]);

const diagnosticsDispositionSchema = z.discriminatedUnion("disposition", [
  z.strictObject({ disposition: z.literal("not-required") }),
  z.strictObject({
    disposition: z.literal("settled"),
    diagnostics: z.array(z.unknown()),
  }),
  z.strictObject({ disposition: z.literal("pending") }),
  z.strictObject({
    disposition: z.literal("failed"),
    error: z.string(),
  }),
]);

const layoutDispositionSchema = z.discriminatedUnion("disposition", [
  z.strictObject({
    requested: z.literal(false),
    disposition: z.literal("not-requested"),
  }),
  z.strictObject({
    requested: z.literal(true),
    disposition: z.literal("not-relevant"),
  }),
  z.strictObject({
    requested: z.literal(true),
    disposition: z.literal("applied"),
    preHash: sha256Schema,
    postHash: sha256Schema,
  }),
  z.strictObject({
    requested: z.literal(true),
    disposition: z.literal("confirmation-required"),
  }),
  z.strictObject({
    requested: z.literal(true),
    disposition: z.literal("declined"),
  }),
  z
    .strictObject({
      requested: z.literal(true),
      disposition: z.literal("failed"),
      error: z.string(),
      preHash: sha256Schema.optional(),
      postHash: sha256Schema.optional(),
    })
    .superRefine(({ preHash, postHash }, context) => {
      if ((preHash === undefined) !== (postHash === undefined))
        context.addIssue({
          code: "custom",
          path: [preHash === undefined ? "preHash" : "postHash"],
          message:
            "A failed layout must provide both hashes when it changed state, or neither when it did not",
        });
      if (preHash !== undefined && preHash === postHash)
        context.addIssue({
          code: "custom",
          path: ["postHash"],
          message: "A failed layout with hashes must identify changed state",
        });
    }),
]);

const finalObservationSchema = z.discriminatedUnion("disposition", [
  z.strictObject({
    disposition: z.literal("observed"),
    documentRevision: z.string().min(1),
    definitionHash: sha256Schema,
  }),
  z.strictObject({
    disposition: z.literal("unavailable"),
    reason: z.string().min(1),
  }),
]);

/** Browser result contract; this module does not claim to implement execution. */
export const applyPetrinautConstructionOutputSchema = z
  .strictObject({
    execution: z.literal("ordered-stop"),
    disposition: z.enum(["complete", "partial", "refused"]),
    reason: z.string().min(1).optional(),
    outcomes: z.array(applyPetrinautConstructionOutcomeSchema).min(1).max(3),
    finalObservation: finalObservationSchema,
    diagnostics: diagnosticsDispositionSchema,
    layout: layoutDispositionSchema,
  })
  .superRefine(
    ({ disposition, finalObservation, outcomes, reason }, context) => {
      outcomes.forEach(({ index }, position) => {
        if (index !== position)
          context.addIssue({
            code: "custom",
            path: ["outcomes", position, "index"],
            message: "outcome indices must be complete and ordered",
          });
      });

      const statuses = outcomes.map(({ status }) => status);
      const terminalIndex = statuses.findIndex(
        (status) => status === "failed" || status === "unknown",
      );
      const successful = (status: (typeof statuses)[number]) =>
        status === "applied" || status === "no-op";
      let validDisposition = false;
      if (disposition === "refused") {
        validDisposition = statuses.every((status) => status === "unattempted");
      } else if (disposition === "complete") {
        validDisposition = statuses.every(successful);
      } else if (terminalIndex >= 0) {
        validDisposition =
          statuses.slice(0, terminalIndex).every(successful) &&
          statuses
            .slice(terminalIndex + 1)
            .every((status) => status === "unattempted");
      }
      if (!validDisposition)
        context.addIssue({
          code: "custom",
          path: ["disposition"],
          message:
            "Disposition must encode either a complete successful/no-op sequence, a refused wholly unattempted sequence, or a partial successful/no-op prefix followed by one failed or unknown operation and an unattempted suffix",
        });

      if (disposition === "refused" && reason === undefined)
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Refused results require a non-empty reason",
        });
      if (disposition !== "refused" && reason !== undefined)
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "Only refused results may include a reason",
        });

      if (
        disposition !== "refused" &&
        finalObservation.disposition !== "observed"
      )
        context.addIssue({
          code: "custom",
          path: ["finalObservation"],
          message: "Complete and partial results require a final observation",
        });
    },
  );

export type ApplyPetrinautConstructionOutput = z.output<
  typeof applyPetrinautConstructionOutputSchema
>;
