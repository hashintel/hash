import { z } from "zod";

import { clipboardPayloadSchema } from "./clipboard/types";
import {
  colorSchema,
  componentInstanceSchema,
  descriptionSchema,
  differentialEquationSchema,
  fusionSchema,
  metadataSchema,
  parameterSchema,
  placeSchema,
  subnetSchema,
  transitionSchema,
} from "./schemas/entity-schemas";
import { metricSchema } from "./schemas/metric-schema";
import { scenarioSchema } from "./schemas/scenario-schema";

/** A whole definition, each entity as the actions validate it, ids canonicalised. */
const definitionSchema = z.strictObject({
  description: descriptionSchema,
  metadata: metadataSchema,
  componentsOnly: z.boolean().optional(),
  places: z.array(placeSchema),
  transitions: z.array(transitionSchema),
  types: z.array(colorSchema),
  differentialEquations: z.array(differentialEquationSchema),
  parameters: z.array(parameterSchema),
  scenarios: z.array(scenarioSchema).optional(),
  metrics: z.array(metricSchema).optional(),
  subnets: z.array(subnetSchema).optional(),
  componentInstances: z.array(componentInstanceSchema).optional(),
  fusions: z.array(fusionSchema).optional(),
});

/**
 * AI-callable commands. Keys MUST also appear in
 * {@link commandActionInputSchemas}. A command must be added here (with a
 * full `meta({ description })`) to be exposed to the AI tool bundle.
 */
export const aiCommandActionInputSchemas = {
  applyAutoLayout: z
    .strictObject({
      askUserFirst: z.boolean().meta({
        description: [
          "Pass `true` to confirm with the user via a Yes/No prompt before applying.",
          "Pass `false` to apply immediately.",
          "Use `false` ONLY when you just built this net from scratch in the current conversation (no user-arranged content existed beforehand).",
          "Otherwise pass `true` so the user can decline — auto-layout will reposition every node.",
        ].join(" "),
      }),
    })
    .meta({
      description: [
        "Reposition every place and transition using an ELK layered layout.",
        "Use immediately after creating a net from scratch.",
        "For nets that already contained user-positioned nodes, pass `askUserFirst: true`",
        "so the user can confirm before running.",
      ].join(" "),
    }),
} as const;

/**
 * All commands the host can invoke on the instance. Includes AI-callable
 * commands plus host-only ones (e.g. clipboard paste) that are intentionally
 * absent from the AI tool surface.
 */
export const commandActionInputSchemas = {
  ...aiCommandActionInputSchemas,
  applyClipboardPaste: z.strictObject({
    payload: clipboardPayloadSchema,
    targetSubnetId: z.string().min(1).nullable().optional(),
  }),
  replaceDefinition: z.strictObject({
    definition: definitionSchema,
  }),
} as const;

export type CommandActionName = keyof typeof commandActionInputSchemas;
export type AiCommandActionName = keyof typeof aiCommandActionInputSchemas;

export type CommandActionInput<Name extends CommandActionName> = z.infer<
  (typeof commandActionInputSchemas)[Name]
>;
export type AiCommandActionInput<Name extends AiCommandActionName> = z.infer<
  (typeof aiCommandActionInputSchemas)[Name]
>;
