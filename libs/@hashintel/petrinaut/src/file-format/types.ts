import { z } from "zod";

export const SDCPN_FILE_FORMAT_VERSION = 1;

const inputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
  type: z.enum(["standard", "inhibitor"]).optional().default("standard"),
});

const outputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
});

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorId: z.string().nullable(),
  dynamicsEnabled: z.boolean(),
  differentialEquationId: z.string().nullable(),
  isPort: z.boolean().optional(),
  visualizerCode: z.string().optional(),
  showAsInitialState: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const transitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
  lambdaType: z.enum(["predicate", "stochastic"]),
  lambdaCode: z.string(),
  transitionKernelCode: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const colorElementSchema = z.object({
  elementId: z.string(),
  name: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
});

const colorSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconSlug: z.string().optional(),
  displayColor: z.string().optional(),
  elements: z.array(colorElementSchema),
});

const differentialEquationSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorId: z.string(),
  code: z.string(),
});

const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  variableName: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
  defaultValue: z.string(),
});

const scenarioParameterSchema = z.object({
  type: z.enum(["real", "integer", "boolean", "ratio"]),
  identifier: z.string(),
  default: z.number(),
});

const initialStateSchema = z.discriminatedUnion("type", [
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
]);

const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  scenarioParameters: z.array(scenarioParameterSchema).default([]),
  parameterOverrides: z.record(z.string(), z.string()).default({}),
  initialState: initialStateSchema.default({ type: "per_place", content: {} }),
});

const wireSchema = z.object({
  externalPlaceId: z.string(),
  internalPlaceId: z.string(),
});

const componentInstanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  subnetId: z.string(),
  parameterValues: z.record(z.string(), z.string()).default({}),
  wiring: z.array(wireSchema).default([]),
  x: z.number().optional(),
  y: z.number().optional(),
});

const subnetSchema = z.object({
  id: z.string(),
  name: z.string(),
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(colorSchema).default([]),
  differentialEquations: z.array(differentialEquationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
  componentInstances: z.array(componentInstanceSchema).default([]),
});

const sdcpnSchema = z.object({
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(colorSchema).default([]),
  differentialEquations: z.array(differentialEquationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
  scenarios: z.array(scenarioSchema).default([]),
  subnets: z.array(subnetSchema).default([]),
  componentInstances: z.array(componentInstanceSchema).default([]),
});

const fileMetaSchema = z.object({
  generator: z.string(),
  generatorVersion: z.string().optional(),
});

/**
 * Schema for the versioned SDCPN file format (v1+).
 * Includes format metadata (version, meta.generator) alongside the SDCPN data.
 */
export const sdcpnFileSchema = sdcpnSchema.extend({
  version: z.number().int().min(1).max(SDCPN_FILE_FORMAT_VERSION),
  meta: fileMetaSchema,
  title: z.string(),
});

/**
 * Schema for the legacy file format (no version/meta, just title + SDCPN data).
 */
export const legacySdcpnFileSchema = sdcpnSchema.extend({
  title: z.string(),
});
