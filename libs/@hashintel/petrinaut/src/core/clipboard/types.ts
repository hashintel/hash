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

export const CLIPBOARD_FORMAT_VERSION = 1;

const clipboardPlaceShape = currentPlaceSchema.omit({
  showAsInitialState: true,
}).shape;

const inputArcSchema = z.object({
  ...currentInputArcSchema.shape,
  type: z.enum(["standard", "inhibitor"]).optional().default("standard"),
});

const outputArcSchema = z.object({
  ...currentOutputArcSchema.shape,
});

/*
 * Clipboard payloads represent an in-memory selected subgraph rather than a
 * full import/export file: positions and visual type fields are required, but
 * scenarios/metrics are intentionally excluded.
 */
const placeSchema = z.object({
  ...clipboardPlaceShape,
  id: z.string(),
  name: z.string(),
});

const transitionSchema = z.object({
  ...currentTransitionSchema.shape,
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
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
  elements: z.array(colorElementSchema),
});

const differentialEquationSchema = z.object({
  ...currentDifferentialEquationSchema.shape,
  id: z.string(),
  name: z.string(),
});

const parameterSchema = z.object({
  ...currentParameterSchema.shape,
  id: z.string(),
  name: z.string(),
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
