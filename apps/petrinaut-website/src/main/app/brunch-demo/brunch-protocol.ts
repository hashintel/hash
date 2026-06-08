import { z } from "zod";

export const brunchInputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
  type: z
    .enum(["standard", "read", "inhibitor"])
    .optional()
    .default("standard"),
});

export const brunchOutputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
});

export const brunchPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorId: z.string().nullable().optional().default(null),
  dynamicsEnabled: z.boolean().optional().default(false),
  differentialEquationId: z.string().nullable().optional().default(null),
  visualizerCode: z.string().optional(),
  showAsInitialState: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const brunchTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(brunchInputArcSchema),
  outputArcs: z.array(brunchOutputArcSchema),
  lambdaType: z
    .enum(["predicate", "stochastic"])
    .optional()
    .default("predicate"),
  lambdaCode: z.string().optional().default(""),
  transitionKernelCode: z.string().optional().default(""),
  x: z.number().optional(),
  y: z.number().optional(),
});

/**
 * Root schema for the Brunch execution-plan definition accepted by the demo.
 *
 * Brunch currently sends a lightweight Petri net shape rather than Petrinaut's
 * full SDCPN document format. This schema validates that experimental input and
 * applies adapter defaults before `normalizeBrunchDefinition` converts it into
 * a read-only SDCPN with unsupported Petrinaut extensions disabled.
 */
export const brunchNetDefinitionSchema = z.object({
  version: z.number().optional().default(1),
  meta: z
    .object({
      generator: z.string().optional(),
      generatorVersion: z.string().optional(),
    })
    .optional(),
  title: z.string().optional().default("Brunch run"),
  places: z.array(brunchPlaceSchema),
  transitions: z.array(brunchTransitionSchema),
  types: z.array(z.unknown()).optional().default([]),
});

export type BrunchNetDefinition = z.output<typeof brunchNetDefinitionSchema>;
export type BrunchNetDefinitionInput = z.input<
  typeof brunchNetDefinitionSchema
>;
export type BrunchTransitionInput = z.input<typeof brunchTransitionSchema>;
