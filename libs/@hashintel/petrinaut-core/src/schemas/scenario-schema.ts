import { z } from "zod";

import { displayNameSchema } from "../validation/display-name";
import { idSchema } from "./entity-schemas";

import type { Scenario } from "../types/sdcpn";

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;
// Strings supply `string` element values literally, and `uuid` element
// values by parsing/coercion (canonical UUID strings pass through; any other
// text converts deterministically via UUIDv5 at compile time).
const tokenAttributeValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
]);

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
            z.union([z.string(), z.array(z.array(tokenAttributeValueSchema))]),
          )
          .meta({
            description: [
              "Map keyed by place ID (NOT place name).",
              'For uncoloured places, the value is a string expression with `parameters` and `scenario` in scope (e.g. `"scenario.population * (1 - scenario.infected_ratio)"`). The result is `Math.round`ed and clamped to >= 0 (token counts are always non-negative integers).',
              "For coloured places, the value is a row array where each inner array supplies element values in the SAME ORDER as the colour type's `elements`. Extra columns throw at compile time; missing columns default to the element type's zero value. String values are literal for `string` elements; for `uuid` elements they parse/coerce to UUIDs.",
              "`parameters` in expressions is keyed by each parameter's `variableName` value (lower_snake_case).",
            ].join(" "),
          }),
      })
      .meta({
        description:
          "Initial state specified place-by-place. Use this for most scenarios. The content keys MUST be existing place IDs.",
      }),
    z
      .strictObject({
        type: z.literal("code"),
        content: z.string().meta({
          description: [
            "Function body (NOT a module — no `export default`, no wrapper) with `parameters` and `scenario` in scope.",
            "MUST `return` an object keyed by PLACE NAME (NOT place ID — note the asymmetry with per_place mode, which uses place IDs).",
            "Per-place values: a number for uncoloured places (rounded and clamped to >= 0); `Array<{ [elementName]: number | boolean }>` for coloured places.",
            "Unknown place names in the returned object are silently dropped — typos produce an empty initial state with no error, so verify names exactly match.",
          ].join(" "),
        }),
      })
      .meta({
        description:
          "Initial state specified by code. Use only when per_place expressions cannot express the setup (e.g. constructing many coloured tokens from a scenario parameter).",
      }),
  ])
  .meta({
    description:
      'Initial token state for a scenario. Prefer type "per_place" (content keyed by place ID); use type "code" (content keyed by place NAME) only for advanced custom setup.',
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
    parameterOverrides: z
      .record(z.string(), z.string())
      .default({})
      .meta({
        description: [
          "Map from existing net-level parameter ID to a concrete value or expression for this scenario. Keys MUST be parameter IDs from the current net.",
          'Values may be numeric literals such as `"1.5"` or expressions using `scenario` and `parameters`, e.g. `"scenario.transmission_multiplier * 0.4"`.',
          "Inside an override expression, `parameters` resolves to net-level DEFAULTS (not other override results) — overrides cannot reference each other.",
          'Omit this field entirely, or use `{}`, when the scenario does not override any net-level parameters. Do NOT emit `""` as a value (it is a no-op at runtime but adds noise).',
        ].join(" "),
      }),
    initialState: initialStateSchema,
  })
  .meta({
    description:
      "A reusable simulation scenario with user-tunable scenarioParameters, overrides for existing net-level parameters, and an initial token state. Prefer adding scenario parameters for key assumptions the user may want to modify between runs.",
  }) satisfies z.ZodType<Scenario>;

export type ScenarioSchema = typeof scenarioSchema;
