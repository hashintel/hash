import { z } from "zod";

import { parseSDCPNFile } from "./file-format/parse-sdcpn-file";
import { sdcpnSchema } from "./file-format/types";

import type { AbortSignalLike } from "./environment";

export const PETRINAUT_OPTIMIZATION_MAX_SEED = 2_147_483_647;
export const PETRINAUT_OPTIMIZATION_MAX_TRIALS = 1_000;
export const PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL = 100_000;
export const PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS = 5_000_000;
export const PETRINAUT_OPTIMIZATION_MAX_SEEDS_PER_TRIAL = 100;

const optimizationScalarSchema = z.union([z.number(), z.boolean()]);

export const petrinautContinuousOptimizationDomainSchema = z
  .strictObject({
    kind: z.literal("continuous"),
    minimum: z.number(),
    maximum: z.number(),
    scale: z.enum(["linear", "log"]),
  })
  .superRefine((domain, context) => {
    if (domain.minimum >= domain.maximum) {
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Maximum must be greater than minimum",
      });
    }
    if (domain.scale === "log" && domain.minimum <= 0) {
      context.addIssue({
        code: "custom",
        path: ["minimum"],
        message: "A logarithmic range must have a positive minimum",
      });
    }
  })
  .meta({
    description: "A continuous Optuna domain for real and ratio parameters.",
  });

export const petrinautIntegerOptimizationDomainSchema = z
  .strictObject({
    kind: z.literal("integer"),
    minimum: z.number().int(),
    maximum: z.number().int(),
    step: z.number().int().positive(),
    scale: z.enum(["linear", "log"]),
  })
  .superRefine((domain, context) => {
    if (domain.minimum >= domain.maximum) {
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Maximum must be greater than minimum",
      });
    } else if ((domain.maximum - domain.minimum) % domain.step !== 0) {
      context.addIssue({
        code: "custom",
        path: ["step"],
        message:
          "Step must divide the range exactly so the maximum is reachable",
      });
    } else if (domain.scale === "log" && domain.minimum <= 0) {
      context.addIssue({
        code: "custom",
        path: ["minimum"],
        message: "A logarithmic range must have a positive minimum",
      });
    } else if (domain.scale === "log" && domain.step !== 1) {
      context.addIssue({
        code: "custom",
        path: ["step"],
        message: "A logarithmic integer range requires a step of 1",
      });
    }
  })
  .meta({ description: "An integer Optuna domain." });

export const petrinautBooleanOptimizationDomainSchema = z
  .strictObject({ kind: z.literal("boolean") })
  .meta({
    description: "The complete false/true domain of a boolean parameter.",
  });

export const petrinautOptimizationDomainSchema = z
  .discriminatedUnion("kind", [
    petrinautContinuousOptimizationDomainSchema,
    petrinautIntegerOptimizationDomainSchema,
    petrinautBooleanOptimizationDomainSchema,
  ])
  .meta({
    description: "A transient Optuna domain for one scenario parameter.",
  });

export const petrinautOptimizationFixedBindingSchema = z
  .strictObject({
    kind: z.literal("fixed"),
    value: optimizationScalarSchema,
  })
  .meta({ description: "A scenario parameter held constant for every trial." });

export const petrinautOptimizationVariableBindingSchema = z
  .strictObject({
    kind: z.literal("optimize"),
    domain: petrinautOptimizationDomainSchema,
  })
  .meta({
    description: "A scenario parameter whose value Optuna may suggest.",
  });

export const petrinautOptimizationParameterBindingSchema = z
  .discriminatedUnion("kind", [
    petrinautOptimizationFixedBindingSchema,
    petrinautOptimizationVariableBindingSchema,
  ])
  .meta({ description: "The per-study treatment of one scenario parameter." });

// -- Constraints --------------------------------------------------------------
//
// Boolean conditions authored as TypeScript and carried as serialized HIR,
// so every consumer — the frontend editors, the CLI, and the Python
// binding — reads one shared expression representation without a TypeScript
// frontend of its own. In this version constraints are declarative payload
// only: nothing enforces or prunes on them yet.

/**
 * Shallow structural validation of one serialized HIR function
 * (`HirFunction` in `hir/hir.ts`, which owns the full grammar). The body is
 * carried as-is: evaluators must reject node kinds they do not know.
 */
export const serializedHirFunctionSchema = z
  .looseObject({
    hirVersion: z.literal(1),
    surface: z.enum([
      "dynamics",
      "lambda",
      "kernel",
      "metric",
      "scenario-expression",
      "scenario-code",
    ]),
    params: z.array(z.looseObject({ name: z.string() })),
    body: z.looseObject({ kind: z.string() }),
  })
  .meta({
    description:
      "A serialized HIR function (see hir/hir.ts for the full grammar). Carried verbatim; evaluators must reject unknown node kinds.",
  });

export const petrinautOptimizationConstraintSchema = z
  .strictObject({
    id: z.string().min(1),
    name: z.string().trim().min(1).optional().meta({
      description: "Optional display name shown wherever the constraint is reported.",
    }),
    code: z.string().trim().min(1).meta({
      description:
        "The authored TypeScript source — the editable text of record. `hir` is its lowered form; regenerating `hir` from `code` must be a no-op.",
    }),
    hir: serializedHirFunctionSchema,
  })
  .meta({
    description:
      "One boolean condition. Parameter-space constraints are expressions over `scenario.*` (and `parameters.*`); state-space constraints are metric-like bodies over the simulation `state`, returning boolean.",
  });

export const petrinautOptimizationConstraintsSchema = z
  .strictObject({
    parameterSpace: z
      .array(petrinautOptimizationConstraintSchema)
      .default([])
      .meta({
        description:
          "Conditions over the sampled scenario parameters (`scenario.*`), e.g. `scenario.min_altitude < scenario.max_altitude`. Intended to let samplers avoid infeasible suggestions; not enforced yet.",
      }),
    stateSpace: z
      .array(petrinautOptimizationConstraintSchema)
      .default([])
      .meta({
        description:
          "Conditions over the simulation state, authored like a metric body but returning boolean. Intended for safe-region margins later; not evaluated yet.",
      }),
  })
  .superRefine((constraints, context) => {
    const seen = new Set<string>();
    for (const [space, list] of [
      ["parameterSpace", constraints.parameterSpace],
      ["stateSpace", constraints.stateSpace],
    ] as const) {
      for (const [index, constraint] of list.entries()) {
        if (seen.has(constraint.id)) {
          addIssue(
            context,
            [space, index, "id"],
            `Duplicate constraint id "${constraint.id}"`,
          );
        }
        seen.add(constraint.id);
      }
      const expectedSurface =
        space === "parameterSpace" ? "scenario-expression" : "metric";
      for (const [index, constraint] of list.entries()) {
        if (constraint.hir.surface !== expectedSurface) {
          addIssue(
            context,
            [space, index, "hir"],
            `A ${space} constraint must lower on the "${expectedSurface}" surface, got "${constraint.hir.surface}"`,
          );
        }
      }
    }
  })
  .meta({
    description:
      "The study's boolean conditions, split by what they range over. Declarative in this version: carried, displayed, and readable from the Python binding, but not yet enforced.",
  });

export const petrinautOptimizationObjectiveSchema = z
  .strictObject({
    metricId: z.string().min(1),
    direction: z.enum(["maximize", "minimize"]),
  })
  .meta({
    description: "The sole metric and direction optimized by the study.",
  });

export const petrinautOptimizationExecutionSchema = z
  .strictObject({
    seed: z.number().int().min(0).max(PETRINAUT_OPTIMIZATION_MAX_SEED),
    dt: z.number().positive(),
    maxTime: z.number().positive(),
    seedsPerTrial: z
      .number()
      .int()
      .min(1)
      .max(PETRINAUT_OPTIMIZATION_MAX_SEEDS_PER_TRIAL)
      .optional()
      .meta({
        description:
          "How many seeded simulations each trial runs. The same derived seed sequence is reused for every trial, and the per-seed objectives are aggregated into the trial objective. Defaults to 1.",
      }),
  })
  .meta({ description: "Simulation settings shared by every trial." });

export const petrinautOptimizationStudySchema = z
  .strictObject({
    trials: z.number().int().min(1).max(PETRINAUT_OPTIMIZATION_MAX_TRIALS),
    sampler: z.enum(["tpe", "random"]),
  })
  .meta({ description: "Optuna study settings." });

const optimizationModelSchema = z
  .strictObject({
    title: z.string(),
    definition: sdcpnSchema,
  })
  .transform((model, context) => {
    const parsed = parseSDCPNFile({ ...model.definition, title: model.title });
    if (!parsed.ok) {
      context.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    const { title: _title, ...definition } = parsed.sdcpn;
    return { title: model.title, definition };
  })
  .meta({
    description: "An immutable, self-contained Petrinaut model snapshot.",
  });

const optimizationScenarioSchema = z
  .strictObject({
    id: z.string().min(1),
    parameterBindings: z.record(
      z.string(),
      petrinautOptimizationParameterBindingSchema,
    ),
  })
  .meta({
    description:
      "The sole scenario and the exhaustive, transient treatment of its parameters.",
  });

function addIssue(
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", path, message });
}

function validateScenarioParameterDefault(
  parameter: {
    identifier: string;
    type: "real" | "integer" | "boolean" | "ratio";
    default: number;
  },
  context: z.core.$RefinementCtx<unknown>,
  path: PropertyKey[],
): void {
  if (parameter.type === "integer" && !Number.isInteger(parameter.default)) {
    addIssue(
      context,
      path,
      `Integer scenario parameter "${parameter.identifier}" requires an integer default`,
    );
  } else if (
    parameter.type === "ratio" &&
    (parameter.default < 0 || parameter.default > 1)
  ) {
    addIssue(
      context,
      path,
      `Ratio scenario parameter "${parameter.identifier}" requires a default between 0 and 1`,
    );
  } else if (
    parameter.type === "boolean" &&
    parameter.default !== 0 &&
    parameter.default !== 1
  ) {
    addIssue(
      context,
      path,
      `Boolean scenario parameter "${parameter.identifier}" requires a default of 0 or 1`,
    );
  }
}

export const petrinautOptimizationManifestSchema = z
  .strictObject({
    kind: z.literal("petrinaut-optimization"),
    version: z.literal(1),
    name: z.string().trim().min(1),
    model: optimizationModelSchema,
    scenario: optimizationScenarioSchema,
    objective: petrinautOptimizationObjectiveSchema,
    constraints: petrinautOptimizationConstraintsSchema.optional().meta({
      description:
        "Optional boolean conditions over the parameter space and the simulation state. Absent means unconstrained.",
    }),
    execution: petrinautOptimizationExecutionSchema,
    study: petrinautOptimizationStudySchema,
  })
  .superRefine((manifest, context) => {
    const scenarios = manifest.model.definition.scenarios ?? [];
    const metrics = manifest.model.definition.metrics ?? [];
    if (scenarios.length !== 1) {
      addIssue(
        context,
        ["model", "definition", "scenarios"],
        "An optimization manifest must contain exactly one scenario",
      );
    }
    if (metrics.length !== 1) {
      addIssue(
        context,
        ["model", "definition", "metrics"],
        "An optimization manifest must contain exactly one metric",
      );
    }

    const scenario = scenarios[0];
    if (!scenario || scenario.id !== manifest.scenario.id) {
      addIssue(
        context,
        ["scenario", "id"],
        "The selected scenario must be the sole scenario in the model snapshot",
      );
      return;
    }
    const objectiveMetric = metrics[0];
    if (
      !objectiveMetric ||
      objectiveMetric.id !== manifest.objective.metricId
    ) {
      addIssue(
        context,
        ["objective", "metricId"],
        "The objective metric must be the sole metric in the model snapshot",
      );
    }
    if (objectiveMetric && objectiveMetric.code.trim() === "") {
      addIssue(
        context,
        ["model", "definition", "metrics", 0, "code"],
        "The objective metric must contain custom expression code",
      );
    }

    const parametersByIdentifier = new Map(
      scenario.scenarioParameters.map((parameter) => [
        parameter.identifier,
        parameter,
      ]),
    );
    if (parametersByIdentifier.size !== scenario.scenarioParameters.length) {
      addIssue(
        context,
        ["model", "definition", "scenarios", 0, "scenarioParameters"],
        "Scenario parameter identifiers must be unique",
      );
    }

    let optimizedParameterCount = 0;
    for (const [index, parameter] of scenario.scenarioParameters.entries()) {
      const path: PropertyKey[] = [
        "scenario",
        "parameterBindings",
        parameter.identifier,
      ];
      validateScenarioParameterDefault(parameter, context, [
        "model",
        "definition",
        "scenarios",
        0,
        "scenarioParameters",
        index,
        "default",
      ]);

      const binding = Object.hasOwn(
        manifest.scenario.parameterBindings,
        parameter.identifier,
      )
        ? manifest.scenario.parameterBindings[parameter.identifier]
        : undefined;
      if (!binding) {
        addIssue(context, path, "Every scenario parameter requires a binding");
        continue;
      }

      if (binding.kind === "fixed") {
        const value = binding.value;
        if (parameter.type === "boolean" && typeof value !== "boolean") {
          addIssue(
            context,
            [...path, "value"],
            "Boolean scenario parameters require a boolean fixed value",
          );
        } else if (parameter.type !== "boolean" && typeof value !== "number") {
          addIssue(
            context,
            [...path, "value"],
            `${parameter.type} scenario parameters require a numeric fixed value`,
          );
        } else if (
          parameter.type === "integer" &&
          typeof value === "number" &&
          !Number.isInteger(value)
        ) {
          addIssue(
            context,
            [...path, "value"],
            "Integer scenario parameters require an integer fixed value",
          );
        } else if (
          parameter.type === "ratio" &&
          typeof value === "number" &&
          (value < 0 || value > 1)
        ) {
          addIssue(
            context,
            [...path, "value"],
            "Ratio scenario parameters require a fixed value between 0 and 1",
          );
        }
        continue;
      }

      optimizedParameterCount++;
      const domain = binding.domain;
      if (
        (parameter.type === "real" || parameter.type === "ratio") &&
        domain.kind !== "continuous"
      ) {
        addIssue(
          context,
          [...path, "domain", "kind"],
          `${parameter.type} scenario parameters require a continuous domain`,
        );
      } else if (parameter.type === "integer" && domain.kind !== "integer") {
        addIssue(
          context,
          [...path, "domain", "kind"],
          "Integer scenario parameters require an integer domain",
        );
      } else if (parameter.type === "boolean" && domain.kind !== "boolean") {
        addIssue(
          context,
          [...path, "domain", "kind"],
          "Boolean scenario parameters require a boolean domain",
        );
      }
      if (
        parameter.type === "ratio" &&
        domain.kind === "continuous" &&
        (domain.minimum < 0 || domain.maximum > 1)
      ) {
        addIssue(
          context,
          [...path, "domain"],
          "A ratio optimization domain must stay between 0 and 1",
        );
      }
    }

    for (const identifier of Object.keys(manifest.scenario.parameterBindings)) {
      if (!parametersByIdentifier.has(identifier)) {
        addIssue(
          context,
          ["scenario", "parameterBindings", identifier],
          "Unknown scenario parameter",
        );
      }
    }
    if (optimizedParameterCount === 0) {
      addIssue(
        context,
        ["scenario", "parameterBindings"],
        "At least one scenario parameter must be optimized",
      );
    }

    const stepsPerTrial = Math.ceil(
      manifest.execution.maxTime / manifest.execution.dt,
    );
    const seedsPerTrial = manifest.execution.seedsPerTrial ?? 1;
    if (
      !Number.isSafeInteger(stepsPerTrial) ||
      stepsPerTrial > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL
    ) {
      addIssue(
        context,
        ["execution"],
        `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()} simulation steps per seeded run`,
      );
    } else if (
      stepsPerTrial * seedsPerTrial * manifest.study.trials >
      PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS
    ) {
      // Blame the seed multiplier only when the study fits without it.
      const fitsUnseeded =
        stepsPerTrial * manifest.study.trials <=
        PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS;
      addIssue(
        context,
        fitsUnseeded ? ["execution", "seedsPerTrial"] : ["study", "trials"],
        `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS.toLocaleString()} simulation steps across all trials`,
      );
    }
  })
  .meta({
    description:
      "A versioned, self-contained study over a flat set of scenario parameters.",
  });

/** The application optimization request is the immutable CLI manifest. */
export const petrinautOptimizationInputSchema =
  petrinautOptimizationManifestSchema;

export const petrinautOptimizationEvaluateParamsSchema = z
  .strictObject({
    parameterValues: z.record(z.string(), optimizationScalarSchema),
  })
  .meta({
    description: "Values suggested for every and only optimized parameter.",
  });

/**
 * The protocol's response shapes are schemas rather than plain types, so the
 * CLI can publish them as JSON Schema and other languages can generate
 * matching types from the one definition.
 */
export const petrinautOptimizationDescribeParameterSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      identifier: z.string(),
      type: z.literal("float"),
      default: z.number(),
      minimum: z.number(),
      maximum: z.number(),
      scale: z.enum(["linear", "log"]),
    }),
    z.strictObject({
      identifier: z.string(),
      type: z.literal("int"),
      // `default` stays a plain number: it comes from the scenario parameter,
      // which the manifest schema does not force to be an integer. The bounds
      // and step come from the integer domain, which does.
      default: z.number(),
      minimum: z.number().int(),
      maximum: z.number().int(),
      step: z.number().int(),
      scale: z.enum(["linear", "log"]),
    }),
    z.strictObject({
      identifier: z.string(),
      type: z.literal("boolean"),
      default: z.boolean(),
    }),
  ])
  .meta({
    description: "One optimized parameter of the study's flat search space.",
  });

export const petrinautOptimizationDescribeResultSchema = z
  .strictObject({
    direction: z.enum(["maximize", "minimize"]),
    study: petrinautOptimizationStudySchema
      .extend({
        seed: z.number().int(),
        seedsPerTrial: z
          .number()
          .int()
          .min(1)
          .max(PETRINAUT_OPTIMIZATION_MAX_SEEDS_PER_TRIAL)
          .optional(),
      })
      .meta({
        description:
          "Study settings with the execution seed. `seedsPerTrial` is reported once the CLI runs seeded replicates; absent means 1.",
      }),
    parameters: z.array(petrinautOptimizationDescribeParameterSchema),
    constraints: petrinautOptimizationConstraintsSchema.optional().meta({
      description:
        "The manifest's constraints, passed through verbatim so protocol clients (the Python binding) can evaluate their HIR. Absent means unconstrained.",
    }),
  })
  .meta({
    description:
      "The `optimization.describe` result: direction, study settings, the parameters that are not fixed, and the study's constraints.",
  });

export const petrinautOptimizationReplicateSchema = z
  .strictObject({
    seed: z.number().int(),
    objective: z.number(),
  })
  .meta({ description: "One seeded run's objective within a trial." });

export const petrinautOptimizationEvaluateResultSchema = z
  .strictObject({
    objective: z.number(),
    replicates: z.array(petrinautOptimizationReplicateSchema).optional(),
  })
  .meta({
    description:
      "The `optimization.evaluate` result. `objective` is the mean of the per-seed objectives (identical to the sole run's objective when the trial runs one seed); `replicates` reports the per-seed values whenever a trial runs more than one.",
  });

export type PetrinautOptimizationConstraint = z.infer<
  typeof petrinautOptimizationConstraintSchema
>;
export type PetrinautOptimizationConstraints = z.infer<
  typeof petrinautOptimizationConstraintsSchema
>;
export type PetrinautOptimizationDescribeParameter = z.infer<
  typeof petrinautOptimizationDescribeParameterSchema
>;
export type PetrinautOptimizationDescribeResult = z.infer<
  typeof petrinautOptimizationDescribeResultSchema
>;
export type PetrinautOptimizationEvaluateParams = z.infer<
  typeof petrinautOptimizationEvaluateParamsSchema
>;
export type PetrinautOptimizationEvaluateResult = z.infer<
  typeof petrinautOptimizationEvaluateResultSchema
>;

const optimizationBestSchema = z
  .strictObject({
    trial: z.number().int().nonnegative(),
    parameters: z.record(z.string(), optimizationScalarSchema),
    objective: z.number(),
  })
  .meta({ description: "The best completed trial so far." });

/**
 * Server-authoritative, strictly increasing sequence number attached to each
 * event of a detached optimization run. A client resuming a run asks for the
 * events with `seq` greater than the last one it applied, and skips any
 * replayed event at or below that cursor. Optional so streams from hosts that
 * predate detached runs keep validating.
 */
const optimizationEventSeqSchema = z.number().int().nonnegative().optional();

export const petrinautOptimizationStartedEventSchema = z
  .strictObject({
    type: z.literal("started"),
    requestedTrials: z.number().int().positive(),
    seq: optimizationEventSeqSchema,
  })
  .meta({ description: "The optimizer accepted and started the study." });

export const petrinautOptimizationTrialEventSchema = z
  .strictObject({
    type: z.literal("trial"),
    trial: z.number().int().nonnegative(),
    parameters: z.record(z.string(), optimizationScalarSchema),
    objective: z.number().nullable(),
    state: z.enum(["complete", "pruned", "failed"]),
    best: optimizationBestSchema.nullable(),
    seq: optimizationEventSeqSchema,
  })
  .meta({ description: "One completed Optuna trial and the running best." });

export const petrinautOptimizationCompleteEventSchema = z
  .strictObject({
    type: z.literal("complete"),
    requestedTrials: z.number().int().positive(),
    completedTrials: z.number().int().nonnegative(),
    prunedTrials: z.number().int().nonnegative(),
    failedTrials: z.number().int().nonnegative(),
    best: optimizationBestSchema.nullable(),
    seq: optimizationEventSeqSchema,
  })
  .meta({ description: "The final optimization summary." });

/**
 * The `code` of the terminal error event that reports a cancellation rather
 * than a failure. A detached run is cancelled out-of-band — an explicit
 * `DELETE`, orphan reaping, or optimizer shutdown — and the stream has no
 * event type of its own for that, so it arrives as a non-retryable error.
 * Consumers presenting run outcomes should treat this code as "cancelled",
 * not "failed".
 */
export const PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE =
  "optimization_cancelled";

export const petrinautOptimizationErrorEventSchema = z
  .strictObject({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    seq: optimizationEventSeqSchema,
  })
  .meta({ description: "A terminal optimizer error." });

export const petrinautOptimizationEventSchema = z
  .discriminatedUnion("type", [
    petrinautOptimizationStartedEventSchema,
    petrinautOptimizationTrialEventSchema,
    petrinautOptimizationCompleteEventSchema,
    petrinautOptimizationErrorEventSchema,
  ])
  .meta({ description: "One event in the optimizer response stream." });

export type PetrinautContinuousOptimizationDomain = z.infer<
  typeof petrinautContinuousOptimizationDomainSchema
>;
export type PetrinautIntegerOptimizationDomain = z.infer<
  typeof petrinautIntegerOptimizationDomainSchema
>;
export type PetrinautBooleanOptimizationDomain = z.infer<
  typeof petrinautBooleanOptimizationDomainSchema
>;
export type PetrinautOptimizationDomain = z.infer<
  typeof petrinautOptimizationDomainSchema
>;
export type PetrinautOptimizationParameterBinding = z.infer<
  typeof petrinautOptimizationParameterBindingSchema
>;
export type PetrinautOptimizationObjective = z.infer<
  typeof petrinautOptimizationObjectiveSchema
>;
export type PetrinautOptimizationExecution = z.infer<
  typeof petrinautOptimizationExecutionSchema
>;
export type PetrinautOptimizationStudy = z.infer<
  typeof petrinautOptimizationStudySchema
>;
export type PetrinautOptimizationManifest = z.infer<
  typeof petrinautOptimizationManifestSchema
>;
export type PetrinautOptimizationInput = PetrinautOptimizationManifest;
export type PetrinautOptimizationEvent = z.infer<
  typeof petrinautOptimizationEventSchema
>;
export type PetrinautOptimizationTrialEvent = z.infer<
  typeof petrinautOptimizationTrialEventSchema
>;

/**
 * Host-provided optimization capability for Petrinaut.
 *
 * A run is detached from any one connection: it is created by id, its event
 * stream can be (re-)attached with a `seq` cursor, and it is cancelled
 * explicitly — which lets the UI survive connection drops and page reloads.
 */
export type PetrinautOptimization = {
  /** Start a detached run and resolve its server-issued run id. */
  createOptimizationRun(
    input: PetrinautOptimizationInput,
    options?: { signal?: AbortSignalLike },
  ): Promise<{ runId: string }>;
  /**
   * Stream a detached run's events, replaying those with `seq` greater than
   * `cursor` (0 replays everything) before tailing live events. The stream
   * ends after a terminal `complete`/`error` event. `onAttached` fires once
   * the attachment is accepted (the response headers arrived OK), which may
   * be long before the first event on a quiet run — UIs use it to report an
   * honest connection state while reconnecting.
   */
  attachOptimizationRun(
    runId: string,
    options?: {
      cursor?: number;
      signal?: AbortSignalLike;
      onAttached?: () => void;
    },
  ): AsyncIterable<PetrinautOptimizationEvent>;
  /** Idempotently stop a detached run server-side. */
  cancelOptimizationRun(runId: string): Promise<void>;
};
