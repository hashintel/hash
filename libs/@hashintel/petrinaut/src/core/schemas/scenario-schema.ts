import { z } from "zod";

import type { Scenario } from "../types/sdcpn";
import { idSchema } from "./entity-schemas";
import { displayNameSchema } from "../validation/display-name";

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

export const scenarioParameterSchema = z
  .strictObject({
    type: z.enum(["real", "integer", "boolean", "ratio"]).meta({
      description: "Primitive scenario parameter type.",
    }),
    identifier: z
      .string()
      .min(1, "Identifier cannot be empty")
      .regex(SNAKE_CASE_RE, "Identifier must be snake_case")
      .meta({
        description:
          "Scenario-scoped identifier, referenced as scenario.identifier in overrides. Must be in snake_case.",
      }),
    default: z.number().meta({
      description: "Default numeric value for this scenario parameter.",
    }),
  })
  .meta({
    description: "A parameter scoped to one scenario.",
  });

const initialStateSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("per_place"),
      content: z.record(
        z.string(),
        z.union([z.string(), z.array(z.array(z.number()))]),
      ),
    }),
    z.strictObject({
      type: z.literal("code"),
      content: z.string(),
    }),
  ])
  .meta({
    description:
      "Initial token state for a scenario, either per-place values or executable code.",
  });

export const scenarioSchema = z
  .strictObject({
    id: idSchema,
    name: displayNameSchema.meta({
      description: "Human-readable scenario name.",
    }),
    description: z.string().optional().meta({
      description: "Optional scenario summary shown to users.",
    }),
    scenarioParameters: z
      .array(scenarioParameterSchema)
      .superRefine((params, ctx) => {
        const seen = new Set<string>();
        for (const [index, p] of params.entries()) {
          if (seen.has(p.identifier)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "identifier"],
              message: `Duplicate identifier "${p.identifier}"`,
            });
          }
          seen.add(p.identifier);
        }
      })
      .meta({
        description:
          "Parameters available only within this scenario and its overrides.",
      }),
    parameterOverrides: z.record(z.string(), z.string()).meta({
      description:
        "Map from net-level parameter ID to concrete value or scenario parameter expression.",
    }),
    initialState: initialStateSchema,
  })
  .meta({
    description:
      "A reusable simulation scenario with parameter overrides and initial token state.",
  }) satisfies z.ZodType<Scenario>;

export type ScenarioSchema = typeof scenarioSchema;
