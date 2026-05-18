import { z } from "zod";

import {
  colorElementSchema as currentColorElementSchema,
  colorSchema as currentColorSchema,
  differentialEquationSchema as currentDifferentialEquationSchema,
  inputArcSchema as currentInputArcSchema,
  outputArcSchema as currentOutputArcSchema,
  parameterSchema as currentParameterSchema,
  placeSchema as currentPlaceSchema,
  transitionSchema as currentTransitionSchema,
} from "../schemas/entity-schemas";
import {
  scenarioParameterSchema as currentScenarioParameterSchema,
  scenarioSchema as currentScenarioSchema,
} from "../schemas/scenario-schema";
import { metricSchema as currentMetricSchema } from "../schemas/metric-schema";

export const SDCPN_FILE_FORMAT_VERSION = 1;

/*
 * File import intentionally stays more permissive than current runtime/action
 * schemas: older files may omit visual fields and input arc type, and imported
 * display names may predate current UI validation rules.
 */
const inputArcSchema = z.object({
  ...currentInputArcSchema.shape,
  type: z.enum(["standard", "inhibitor"]).optional().default("standard"),
});

const outputArcSchema = z.object({
  ...currentOutputArcSchema.shape,
});

const placeSchema = z.object({
  ...currentPlaceSchema.shape,
  id: z.string(),
  name: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const transitionSchema = z.object({
  ...currentTransitionSchema.shape,
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
  x: z.number().optional(),
  y: z.number().optional(),
});

const colorElementSchema = z.object({
  ...currentColorElementSchema.shape,
  elementId: z.string(),
  name: z.string(),
});

const colorSchema = z.object({
  ...currentColorSchema.shape,
  id: z.string(),
  name: z.string(),
  iconSlug: z.string().optional(),
  displayColor: z.string().optional(),
  elements: z.array(colorElementSchema),
});

const differentialEquationSchema = z.object({
  ...currentDifferentialEquationSchema.shape,
  id: z.string(),
  name: z.string(),
  colorId: z.string().nullable(),
});

const parameterSchema = z.object({
  ...currentParameterSchema.shape,
  id: z.string(),
  name: z.string(),
});

const scenarioParameterSchema = z.object({
  ...currentScenarioParameterSchema.shape,
  identifier: z.string(),
});

const scenarioSchema = z.object({
  ...currentScenarioSchema.shape,
  id: z.string(),
  name: z.string(),
  scenarioParameters: z.array(scenarioParameterSchema).default([]),
  parameterOverrides: z.record(z.string(), z.string()).default({}),
  initialState: currentScenarioSchema.shape.initialState.default({
    type: "per_place",
    content: {},
  }),
});

const metricSchema = z.object({
  ...currentMetricSchema.shape,
  id: z.string(),
  name: z.string(),
  code: z.string().default(""),
});

const sdcpnSchema = z.object({
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(colorSchema).default([]),
  differentialEquations: z.array(differentialEquationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
  scenarios: z.array(scenarioSchema).default([]),
  metrics: z.array(metricSchema).default([]),
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
