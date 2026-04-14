import { z } from "zod";

import type { Scenario } from "../types/sdcpn";

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;

export const scenarioParameterSchema = z.object({
  type: z.enum(["real", "integer", "boolean", "ratio"]),
  identifier: z
    .string()
    .min(1, "Identifier cannot be empty")
    .regex(SNAKE_CASE_RE, "Identifier must be snake_case"),
  default: z.number(),
});

export const scenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Scenario name is required"),
  description: z.string().optional(),
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
    }),
  parameterOverrides: z.record(z.string(), z.string()),
  initialState: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("per_place"),
      content: z.record(
        z.string(),
        z.union([z.string(), z.array(z.array(z.number()))]),
      ),
    }),
    z.object({
      type: z.literal("code"),
      content: z.string(),
    }),
  ]),
}) satisfies z.ZodType<Scenario>;

export type ScenarioSchema = typeof scenarioSchema;
