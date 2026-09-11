/**
 * @layerRoot core.ai
 * @role Defines contracts for host-run AI experiments
 */
import { z } from "zod";

import type { AbortSignalLike } from "../environment";

const parameterValueSchema = z.union([z.number().finite(), z.boolean()]);
const parameterInputSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("fixed"), value: parameterValueSchema }),
  z.strictObject({
    mode: z.literal("range"),
    min: z.number().finite(),
    max: z.number().finite(),
  }),
]);

export const petrinautExperimentRequestSchema = z
  .strictObject({
    name: z.string().min(1).max(120),
    scenarioId: z.string().min(1),
    scenarioParameterValues: z
      .record(z.string().min(1), parameterInputSchema)
      .describe(
        "Scenario parameter identifiers mapped to typed fixed values or optimization ranges. Omitted parameters use their saved defaults.",
      ),
    runCount: z.number().int().min(1).max(1000),
    seed: z.number().int().min(0).max(4294967295),
    dt: z.number().positive().max(1_000_000),
    maxTime: z.number().positive().max(1_000_000),
    metricIds: z.array(z.string().min(1)).min(1).max(20),
    execution: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("simulate") }),
      z.strictObject({
        mode: z.literal("optimize"),
        objectiveMetricId: z.string().min(1),
        direction: z.enum(["minimize", "maximize"]),
        steps: z.number().int().min(1).max(100),
        runsPerStep: z.number().int().min(1).max(1000),
      }),
    ]),
  })
  .superRefine((request, context) => {
    if (
      request.dt > request.maxTime ||
      request.maxTime / request.dt > 1_000_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["dt"],
        message:
          "Time step must fit the duration and keep each run within 1,000,000 steps.",
      });
    }
    if (new Set(request.metricIds).size !== request.metricIds.length) {
      context.addIssue({
        code: "custom",
        path: ["metricIds"],
        message: "Metric IDs must be unique.",
      });
    }
    let rangeCount = 0;
    for (const [parameterId, parameter] of Object.entries(
      request.scenarioParameterValues,
    )) {
      if (parameter.mode === "range") {
        rangeCount += 1;
        if (parameter.min >= parameter.max) {
          context.addIssue({
            code: "custom",
            path: ["scenarioParameterValues", parameterId],
            message: "Range minimum must be less than its maximum.",
          });
        }
      }
    }
    if (request.execution.mode === "simulate" && rangeCount > 0) {
      context.addIssue({
        code: "custom",
        path: ["scenarioParameterValues"],
        message: "Simulation requires fixed parameter values.",
      });
    }
    if (request.execution.mode === "optimize") {
      if (rangeCount === 0) {
        context.addIssue({
          code: "custom",
          path: ["scenarioParameterValues"],
          message: "Optimization requires at least one parameter range.",
        });
      }
      if (!request.metricIds.includes(request.execution.objectiveMetricId)) {
        context.addIssue({
          code: "custom",
          path: ["execution", "objectiveMetricId"],
          message: "The objective must be included in metricIds.",
        });
      }
      if (request.execution.runsPerStep > request.runCount) {
        context.addIssue({
          code: "custom",
          path: ["execution", "runsPerStep"],
          message: "Runs per step must not exceed runCount.",
        });
      }
      if (request.execution.steps * request.execution.runsPerStep > 10_000) {
        context.addIssue({
          code: "custom",
          path: ["execution"],
          message: "Optimization must request at most 10,000 search runs.",
        });
      }
    }
  })
  .describe(
    "Create and run an Experiment in the connected Petrinaut host using a saved scenario and saved metrics. Returns the final result after bounded simulation or optimization finishes. Read the net first to obtain scenario and metric IDs and scenario parameter identifiers. The host validates and compiles a frozen model before running; local progress appears while this tool waits.",
  );

export type PetrinautExperimentRequest = z.infer<
  typeof petrinautExperimentRequestSchema
>;

export type PetrinautExperimentProgress = {
  experimentId: string;
  name: string;
  phase: "validating" | "running" | "optimizing" | "refining";
  runsCompleted: number;
  runsTarget: number;
  step?: number;
  steps?: number;
};

export const petrinautExperimentResultSchema = z.strictObject({
  status: z.enum(["complete", "cancelled", "error"]),
  experimentId: z.string().nullable(),
  name: z.string(),
  message: z.string().optional(),
  runsCompleted: z.number().int().nonnegative(),
  metrics: z.array(
    z.strictObject({
      id: z.string(),
      label: z.string(),
      value: z.number().finite().nullable(),
    }),
  ),
  optimization: z
    .strictObject({
      parameters: z.record(z.string(), parameterValueSchema),
      objectiveValue: z.number().finite().nullable(),
      stepsCompleted: z.number().int().nonnegative(),
    })
    .optional(),
});

export type PetrinautExperimentResult = z.infer<
  typeof petrinautExperimentResultSchema
>;

export type PetrinautExperimentHost = {
  /** Resolves with a captured terminal result; progress stays local to the host. */
  createExperiment: (
    request: PetrinautExperimentRequest,
    options?: {
      signal?: AbortSignalLike;
      onProgress?: (progress: PetrinautExperimentProgress) => void;
    },
  ) => Promise<PetrinautExperimentResult>;
};
