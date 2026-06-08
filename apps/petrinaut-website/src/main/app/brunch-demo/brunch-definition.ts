import { z } from "zod";

import {
  calculateGraphLayout,
  layoutNodeDimensions,
} from "@hashintel/petrinaut-core";

import type { SDCPN } from "@hashintel/petrinaut-core";

const inputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
  type: z
    .enum(["standard", "read", "inhibitor"])
    .optional()
    .default("standard"),
});

const outputArcSchema = z.object({
  placeId: z.string(),
  weight: z.number(),
});

const placeSchema = z.object({
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

const transitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  inputArcs: z.array(inputArcSchema),
  outputArcs: z.array(outputArcSchema),
  lambdaType: z
    .enum(["predicate", "stochastic"])
    .optional()
    .default("predicate"),
  lambdaCode: z.string().optional().default(""),
  transitionKernelCode: z.string().optional().default(""),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const brunchNetDefinitionSchema = z.object({
  version: z.number().optional().default(1),
  meta: z
    .object({
      generator: z.string().optional(),
      generatorVersion: z.string().optional(),
    })
    .optional(),
  title: z.string().optional().default("Brunch run"),
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(z.unknown()).optional().default([]),
});

export type BrunchNetDefinition = z.infer<typeof brunchNetDefinitionSchema>;

const shouldAutoLayout = (definition: BrunchNetDefinition): boolean => {
  const nodes = [...definition.places, ...definition.transitions];

  if (nodes.some((node) => node.x === undefined || node.y === undefined)) {
    return true;
  }

  return (
    nodes.length > 1 && nodes.every((node) => node.x === 0 && node.y === 0)
  );
};

const toSDCPN = (definition: BrunchNetDefinition): SDCPN => ({
  places: definition.places.map((place) => ({
    id: place.id,
    name: place.name,
    colorId: place.colorId,
    dynamicsEnabled: place.dynamicsEnabled,
    differentialEquationId: place.differentialEquationId,
    visualizerCode: place.visualizerCode,
    showAsInitialState: place.showAsInitialState,
    x: place.x ?? 0,
    y: place.y ?? 0,
  })),
  transitions: definition.transitions.map((transition) => ({
    id: transition.id,
    name: transition.name,
    inputArcs: transition.inputArcs,
    outputArcs: transition.outputArcs,
    lambdaType: transition.lambdaType,
    lambdaCode: transition.lambdaCode,
    transitionKernelCode: transition.transitionKernelCode,
    x: transition.x ?? 0,
    y: transition.y ?? 0,
  })),
  types: [],
  differentialEquations: [],
  parameters: [],
});

export const normalizeBrunchDefinition = async (
  definition: BrunchNetDefinition,
): Promise<SDCPN> => {
  const sdcpn = toSDCPN(definition);

  if (!shouldAutoLayout(definition)) {
    return sdcpn;
  }

  const positions = await calculateGraphLayout(sdcpn, layoutNodeDimensions);

  return {
    ...sdcpn,
    places: sdcpn.places.map((place) => ({
      ...place,
      ...positions[place.id],
    })),
    transitions: sdcpn.transitions.map((transition) => ({
      ...transition,
      ...positions[transition.id],
    })),
  };
};
