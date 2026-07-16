import { z } from "zod";

import { sdcpnSchema } from "./file-format/types";

import type { AbortSignalLike } from "./environment";

export const PETRINAUT_OPTIMIZATION_MAX_SEED = 2_147_483_647;
export const PETRINAUT_OPTIMIZATION_MAX_TRIALS = 1_000;
export const PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL = 100_000;
export const PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS = 5_000_000;

const optimizationScalarSchema = z.union([z.number(), z.boolean()]);

const parameterIdentifierSchema = z
  .string()
  .min(1)
  .meta({ description: "Identifier of a parameter on the selected scenario." });

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
  .meta({ description: "A continuous numeric Optuna search domain." });

export const petrinautIntegerOptimizationDomainSchema = z
  .strictObject({
    kind: z.literal("integer"),
    minimum: z.number().int(),
    maximum: z.number().int(),
    step: z.number().int().positive(),
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
    }
  })
  .meta({ description: "An integer Optuna search domain." });

export const petrinautCategoricalOptimizationDomainSchema = z
  .strictObject({
    kind: z.literal("categorical"),
    values: z.array(optimizationScalarSchema).min(2),
  })
  .superRefine((domain, context) => {
    if (new Set(domain.values).size !== domain.values.length) {
      context.addIssue({
        code: "custom",
        path: ["values"],
        message: "Categorical values must be unique",
      });
    }
  })
  .meta({ description: "A flat scalar categorical Optuna search domain." });

export const petrinautOptimizationDomainSchema = z
  .discriminatedUnion("kind", [
    petrinautContinuousOptimizationDomainSchema,
    petrinautIntegerOptimizationDomainSchema,
    petrinautCategoricalOptimizationDomainSchema,
  ])
  .meta({ description: "The values Optuna may propose for one parameter." });

export const petrinautOptimizationVariableSchema = z
  .strictObject({
    identifier: parameterIdentifierSchema,
    domain: petrinautOptimizationDomainSchema,
  })
  .meta({
    description:
      "One flat scenario parameter and the domain Optuna may search for it.",
  });

export const petrinautOptimizationSearchSpaceSchema = z
  .strictObject({
    version: z.literal(1),
    variables: z.array(petrinautOptimizationVariableSchema).min(1),
  })
  .superRefine((searchSpace, context) => {
    const identifiers = new Set<string>();
    for (const [index, variable] of searchSpace.variables.entries()) {
      if (identifiers.has(variable.identifier)) {
        context.addIssue({
          code: "custom",
          path: ["variables", index, "identifier"],
          message: `Parameter "${variable.identifier}" is duplicated`,
        });
      }
      identifiers.add(variable.identifier);
    }
  })
  .meta({
    description:
      "A versioned, flat collection of scenario parameters Optuna may change.",
  });

const optimizationModelSchema = z
  .strictObject({
    title: z.string(),
    definition: sdcpnSchema,
  })
  .meta({
    description: "The immutable Petrinaut model snapshot for this run.",
  });

const optimizationScenarioSchema = z
  .strictObject({
    id: z.string().min(1),
    parameterValues: z.record(z.string(), optimizationScalarSchema),
  })
  .meta({
    description:
      "The selected scenario and a complete flat snapshot of its parameter values.",
  });

export const petrinautOptimizationObjectiveSchema = z
  .strictObject({
    metricId: z.string().min(1),
    direction: z.enum(["maximize", "minimize"]),
  })
  .meta({
    description:
      "The saved model metric whose final-frame value should be optimized.",
  });

const optimizationExecutionSchema = z
  .strictObject({
    seed: z.number().int().min(0).max(PETRINAUT_OPTIMIZATION_MAX_SEED),
    dt: z.number().positive(),
    maxTime: z.number().positive(),
  })
  .meta({ description: "Simulation settings shared by every trial." });

const optimizationOptionsSchema = z
  .strictObject({
    trials: z.number().int().min(1).max(PETRINAUT_OPTIMIZATION_MAX_TRIALS),
    sampler: z.enum(["tpe", "random"]),
  })
  .meta({ description: "Optuna study settings." });

export const petrinautOptimizationInputSchema = z
  .strictObject({
    name: z.string().trim().min(1),
    model: optimizationModelSchema,
    scenario: optimizationScenarioSchema,
    searchSpace: petrinautOptimizationSearchSpaceSchema,
    objective: petrinautOptimizationObjectiveSchema,
    execution: optimizationExecutionSchema,
    optimization: optimizationOptionsSchema,
  })
  .superRefine((input, context) => {
    const scenario = input.model.definition.scenarios.find(
      (candidate) => candidate.id === input.scenario.id,
    );
    if (!scenario) {
      context.addIssue({
        code: "custom",
        path: ["scenario", "id"],
        message: "The selected scenario does not exist in the model",
      });
      return;
    }

    const metricExists = input.model.definition.metrics.some(
      (metric) => metric.id === input.objective.metricId,
    );
    if (!metricExists) {
      context.addIssue({
        code: "custom",
        path: ["objective", "metricId"],
        message: "The objective metric does not exist in the model",
      });
    }

    const parametersByIdentifier = new Map(
      scenario.scenarioParameters.map((parameter) => [
        parameter.identifier,
        parameter,
      ]),
    );

    for (const parameter of scenario.scenarioParameters) {
      const value = input.scenario.parameterValues[parameter.identifier];
      if (value === undefined) {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", parameter.identifier],
          message: "A value is required for every scenario parameter",
        });
        continue;
      }
      if (parameter.type === "real" && typeof value !== "number") {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", parameter.identifier],
          message: "Real scenario parameters require a numeric value",
        });
      }
      if (
        parameter.type === "integer" &&
        (typeof value !== "number" || !Number.isInteger(value))
      ) {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", parameter.identifier],
          message: "Integer scenario parameters require an integer value",
        });
      }
      if (
        parameter.type === "ratio" &&
        (typeof value !== "number" || value < 0 || value > 1)
      ) {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", parameter.identifier],
          message: "Ratio scenario parameters must be between 0 and 1",
        });
      }
      if (parameter.type === "boolean" && typeof value !== "boolean") {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", parameter.identifier],
          message: "Boolean scenario parameters require a boolean value",
        });
      }
    }

    for (const identifier of Object.keys(input.scenario.parameterValues)) {
      if (!parametersByIdentifier.has(identifier)) {
        context.addIssue({
          code: "custom",
          path: ["scenario", "parameterValues", identifier],
          message: "Unknown scenario parameter",
        });
      }
    }

    for (const [index, variable] of input.searchSpace.variables.entries()) {
      const parameter = parametersByIdentifier.get(variable.identifier);
      const path: PropertyKey[] = ["searchSpace", "variables", index, "domain"];
      if (!parameter) {
        context.addIssue({
          code: "custom",
          path: ["searchSpace", "variables", index, "identifier"],
          message: "Unknown scenario parameter",
        });
        continue;
      }

      if (
        (parameter.type === "real" || parameter.type === "ratio") &&
        variable.domain.kind !== "continuous"
      ) {
        context.addIssue({
          code: "custom",
          path: [...path, "kind"],
          message: `${parameter.type} parameters require a continuous domain`,
        });
      } else if (
        parameter.type === "integer" &&
        variable.domain.kind !== "integer"
      ) {
        context.addIssue({
          code: "custom",
          path: [...path, "kind"],
          message: "Integer parameters require an integer domain",
        });
      } else if (
        parameter.type === "boolean" &&
        (variable.domain.kind !== "categorical" ||
          variable.domain.values.length !== 2 ||
          !variable.domain.values.includes(false) ||
          !variable.domain.values.includes(true))
      ) {
        context.addIssue({
          code: "custom",
          path,
          message:
            "Boolean parameters must search the categorical values false and true",
        });
      }

      if (
        parameter.type === "ratio" &&
        variable.domain.kind === "continuous" &&
        (variable.domain.minimum < 0 || variable.domain.maximum > 1)
      ) {
        context.addIssue({
          code: "custom",
          path,
          message: "A ratio search domain must stay between 0 and 1",
        });
      }
    }

    const stepsPerTrial = Math.ceil(
      input.execution.maxTime / input.execution.dt,
    );
    if (
      !Number.isSafeInteger(stepsPerTrial) ||
      stepsPerTrial > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL
    ) {
      context.addIssue({
        code: "custom",
        path: ["execution"],
        message: `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()} simulation steps per trial`,
      });
    } else if (
      stepsPerTrial * input.optimization.trials >
      PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS
    ) {
      context.addIssue({
        code: "custom",
        path: ["optimization", "trials"],
        message: `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS.toLocaleString()} simulation steps across all trials`,
      });
    }
  })
  .meta({
    description:
      "A complete request for optimizing flat parameters of one selected scenario.",
  });

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
  .meta({ description: "One line in the optimizer NDJSON response stream." });

export type PetrinautOptimizationDomain = z.infer<
  typeof petrinautOptimizationDomainSchema
>;
export type PetrinautOptimizationVariable = z.infer<
  typeof petrinautOptimizationVariableSchema
>;
export type PetrinautOptimizationSearchSpace = z.infer<
  typeof petrinautOptimizationSearchSpaceSchema
>;
export type PetrinautOptimizationObjective = z.infer<
  typeof petrinautOptimizationObjectiveSchema
>;
export type PetrinautOptimizationInput = z.infer<
  typeof petrinautOptimizationInputSchema
>;
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
