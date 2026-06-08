import { z } from "zod";

export const brunchInputArcSchema = z
  .object({
    placeId: z.string(),
    weight: z.number(),
    type: z
      .enum(["standard", "read", "inhibitor"])
      .optional()
      .default("standard"),
  })
  .strict();

export const brunchOutputArcSchema = z
  .object({
    placeId: z.string(),
    weight: z.number(),
  })
  .strict();

export const brunchPlaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .strict();

export const brunchTransitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    inputArcs: z.array(brunchInputArcSchema),
    outputArcs: z.array(brunchOutputArcSchema),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .strict();

/**
 * Temporary root schema for the Brunch execution-plan definition accepted by
 * the demo.
 *
 * This is intentionally not Petrinaut's full SDCPN document format. It only
 * accepts the plain graph data Actual Mode currently reads from Brunch:
 * places, transitions, arcs, weights, arc types, and optional coordinates.
 *
 * Extension-specific SDCPN fields are excluded on purpose. The Brunch Actual
 * Mode route does not currently support colours, stochasticity, dynamics,
 * parameters, transition lambdas, transition kernels, visualizers, or colour
 * types. `normalizeBrunchDefinition` supplies the required SDCPN defaults while
 * creating a read-only handle with Petrinaut extensions disabled.
 *
 * The whole schema is temporary and should be replaced by the standardized
 * Brunch/Petrinaut protocol once that protocol is owned in Petrinaut Core.
 */
export const brunchNetDefinitionSchema = z
  .object({
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
  })
  .strict();

export type BrunchNetDefinition = z.output<typeof brunchNetDefinitionSchema>;
export type BrunchNetDefinitionInput = z.input<
  typeof brunchNetDefinitionSchema
>;
export type BrunchTransitionInput = z.input<typeof brunchTransitionSchema>;
