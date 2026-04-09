import { z } from "zod";

export const SDCPN_FILE_FORMAT_VERSION = 1;

const arcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
  type: z.enum(["standard", "inhibitor"]).optional().default("standard"),
});

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  colorId: z.string().nullable(),
  dynamicsEnabled: z.boolean(),
  differentialEquationId: z.string().nullable(),
  visualizerCode: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const transitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(arcSchema),
  outputArcs: z.array(arcSchema),
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

const sdcpnSchema = z.object({
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(colorSchema).default([]),
  differentialEquations: z.array(differentialEquationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
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
