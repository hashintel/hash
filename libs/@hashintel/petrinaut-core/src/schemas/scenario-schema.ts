import { z } from "zod";

import type { Scenario } from "../types/sdcpn";
import { idSchema } from "./entity-schemas";
import { displayNameSchema } from "../validation/display-name";

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

export const scenarioParameterSchema = z
  .strictObject({
    type: z.enum(["real", "integer", "boolean", "ratio"]).meta({
      description:
        "Primitive type for a user-tunable scenario variable. Use ratio for 0-1 proportions, integer for counts, real for rates or other continuous values, and boolean for switches.",
    }),
    identifier: z
      .string()
      .min(1, "Identifier cannot be empty")
      .regex(SNAKE_CASE_RE, "Identifier must be snake_case")
      .meta({
        description:
          "Scenario-scoped identifier for a user-tunable variable. Reference it as scenario.identifier in parameterOverrides and initialState expressions. Must be snake_case.",
      }),
    default: z.number().meta({
      description:
        "Default numeric value for this scenario parameter, shown to the user before they adjust the scenario.",
    }),
  })
  .meta({
    description:
      "A user-tunable variable scoped to one scenario. Prefer scenario parameters for key assumptions the user may want to modify between simulation runs, such as population size, initial infected ratio, intervention strength, or stress-test severity.",
  });

const initialStateSchema = z
  .discriminatedUnion("type", [
    z
      .strictObject({
        type: z.literal("per_place"),
        content: z
          .record(
            z.string(),
            z.union([z.string(), z.array(z.array(z.number()))]),
          )
          .meta({
            description:
              'Map from place ID to initial tokens for that place. For uncoloured places, use a string expression that evaluates to the initial token count, for example "scenario.population * scenario.initial_ratio". For coloured places, use number[][] token rows.',
          }),
      })
      .meta({
        description:
          "Initial state specified place-by-place. Use this for most scenarios. The content keys must be existing place IDs.",
      }),
    z
      .strictObject({
        type: z.literal("code"),
        content: z.string().meta({
          description:
            "Executable code for advanced initial-state setup. It should return the full initial token mapping by place ID.",
        }),
      })
      .meta({
        description:
          "Initial state specified by code. Use only when per_place expressions cannot express the setup.",
      }),
  ])
  .meta({
    description:
      'Initial token state for a scenario. Prefer type "per_place" with content keyed by place ID; use type "code" only for advanced custom setup.',
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
          "User-tunable parameters available only within this scenario. Add scenario parameters for important scenario variables so users can adjust them without editing net-level parameters or code. Reference them as scenario.identifier in parameterOverrides and initialState expressions.",
      }),
    parameterOverrides: z.record(z.string(), z.string()).default({}).meta({
      description:
        'Map from existing net-level parameter ID to a concrete value or expression for this scenario. Keys must be parameter IDs from the current net. Values may be literals such as "1.5" or expressions using scenario parameters such as "scenario.transmission_multiplier * 0.4". Omit this field or use {} when the scenario does not override any net-level parameters.',
    }),
    initialState: initialStateSchema,
  })
  .meta({
    description:
      "A reusable simulation scenario with user-tunable scenarioParameters, overrides for existing net-level parameters, and an initial token state. Prefer adding scenario parameters for key assumptions the user may want to modify between runs.",
  }) satisfies z.ZodType<Scenario>;

export type ScenarioSchema = typeof scenarioSchema;
