/**
 * Support for the pre-2025-11-28 SDCPN file format.
 *
 * This format used different field names (e.g. `type` instead of `colorId`,
 * `differentialEquationCode` instead of `differentialEquationId`, `iconId`
 * instead of `iconSlug`) and included `id`/`title` inside the SDCPN definition.
 *
 * This module validates and converts old-format files into the current SDCPN shape.
 */

import { z } from "zod";

import type { SDCPN } from "../core/types/sdcpn";

// -- Zod schema ---------------------------------------------------------------

const arcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
});

const oldPlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  dynamicsEnabled: z.boolean(),
  differentialEquationCode: z.object({ refId: z.string() }).nullable(),
  visualizerCode: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const oldTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(arcSchema),
  outputArcs: z.array(arcSchema),
  lambdaType: z.enum(["predicate", "stochastic"]),
  lambdaCode: z.string(),
  transitionKernelCode: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const oldColorElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
});

const oldColorSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconId: z.string(),
  colorCode: z.string(),
  elements: z.array(oldColorElementSchema),
});

const oldDifferentialEquationSchema = z.object({
  id: z.string(),
  name: z.string(),
  typeId: z.string(),
  code: z.string(),
});

const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  variableName: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
  defaultValue: z.string(),
});

export const oldFormatFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  places: z.array(oldPlaceSchema),
  transitions: z.array(oldTransitionSchema),
  types: z.array(oldColorSchema).default([]),
  differentialEquations: z.array(oldDifferentialEquationSchema).default([]),
  parameters: z.array(parameterSchema).default([]),
});

type OldFormatFile = z.infer<typeof oldFormatFileSchema>;

// -- Conversion ---------------------------------------------------------------

export const convertOldFormatToSDCPN = (
  old: OldFormatFile,
): SDCPN & { title: string } => {
  return {
    title: old.title,
    places: old.places.map(
      ({ width: _w, height: _h, type, differentialEquationCode, ...rest }) => ({
        ...rest,
        colorId: type,
        differentialEquationId: differentialEquationCode?.refId ?? null,
      }),
    ),
    transitions: old.transitions.map(
      ({ width: _w, height: _h, ...rest }) => rest,
    ),
    types: old.types.map((t) => ({
      id: t.id,
      name: t.name,
      iconSlug: t.iconId,
      displayColor: t.colorCode,
      elements: t.elements.map((e) => ({
        elementId: e.id,
        name: e.name,
        type: e.type,
      })),
    })),
    differentialEquations: old.differentialEquations.map((de) => ({
      id: de.id,
      name: de.name,
      colorId: de.typeId,
      code: de.code,
    })),
    parameters: old.parameters,
  };
};
