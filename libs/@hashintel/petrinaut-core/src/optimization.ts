import { z } from "zod";

import { parseSDCPNFile } from "./file-format/parse-sdcpn-file";
import { sdcpnSchema } from "./file-format/types";

import type { AbortSignalLike } from "./environment";

export const PETRINAUT_OPTIMIZATION_MAX_SEED = 2_147_483_647;
export const PETRINAUT_OPTIMIZATION_MAX_TRIALS = 1_000;
export const PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL = 100_000;
export const PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS = 5_000_000;

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
    if (
      !Number.isSafeInteger(stepsPerTrial) ||
      stepsPerTrial > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL
    ) {
      addIssue(
        context,
        ["execution"],
        `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()} simulation steps per trial`,
      );
    } else if (
      stepsPerTrial * manifest.study.trials >
      PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS
    ) {
      addIssue(
        context,
        ["study", "trials"],
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

export type PetrinautOptimizationDescribeParameter =
  | {
      identifier: string;
      type: "float";
      default: number;
      minimum: number;
      maximum: number;
      scale: "linear" | "log";
    }
  | {
      identifier: string;
      type: "int";
      default: number;
      minimum: number;
      maximum: number;
      step: number;
      scale: "linear" | "log";
    }
  | {
      identifier: string;
      type: "boolean";
      default: boolean;
    };

export type PetrinautOptimizationDescribeResult = {
  direction: "maximize" | "minimize";
  study: PetrinautOptimizationStudy & { seed: number };
  parameters: PetrinautOptimizationDescribeParameter[];
};

export type PetrinautOptimizationEvaluateParams = z.infer<
  typeof petrinautOptimizationEvaluateParamsSchema
>;

export type PetrinautOptimizationEvaluateResult = { objective: number };

const optimizationBestSchema = z
  .strictObject({
    trial: z.number().int().nonnegative(),
    parameters: z.record(z.string(), optimizationScalarSchema),
    objective: z.number(),
  })
  .meta({ description: "The best completed trial so far." });

export const petrinautOptimizationStartedEventSchema = z
  .strictObject({
    type: z.literal("started"),
    requestedTrials: z.number().int().positive(),
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
  })
  .meta({ description: "The final optimization summary." });

export const petrinautOptimizationErrorEventSchema = z
  .strictObject({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
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

/** Host-provided optimization capability for Petrinaut. */
export type PetrinautOptimization = {
  optimize(
    input: PetrinautOptimizationInput,
    options?: { signal?: AbortSignalLike },
  ): AsyncIterable<PetrinautOptimizationEvent>;
};
