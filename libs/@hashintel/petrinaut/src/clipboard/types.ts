import { z } from "zod";

export const CLIPBOARD_FORMAT_VERSION = 1;

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
  visualizerCode: z.string().optional(),
  x: z.number(),
  y: z.number(),
});

const transitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
  lambdaType: z.enum(["predicate", "stochastic"]),
  lambdaCode: z.string(),
  transitionKernelCode: z.string(),
  x: z.number(),
  y: z.number(),
});

const colorElementSchema = z.object({
  elementId: z.string(),
  name: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
});

const colorSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconSlug: z.string(),
  displayColor: z.string(),
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

export const clipboardPayloadSchema = z.object({
  format: z.literal("petrinaut-sdcpn"),
  version: z.number().int().min(1).max(CLIPBOARD_FORMAT_VERSION),
  documentId: z.string().nullable(),
  data: z.object({
    places: z.array(placeSchema),
    transitions: z.array(transitionSchema),
    types: z.array(colorSchema),
    differentialEquations: z.array(differentialEquationSchema),
    parameters: z.array(parameterSchema),
  }),
});

/**
 * The clipboard payload format for petrinaut copy/paste.
 * Derived from {@link clipboardPayloadSchema}.
 */
export type ClipboardPayload = z.infer<typeof clipboardPayloadSchema>;
