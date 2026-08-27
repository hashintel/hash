/**
 * The persistence schema for an ad-hoc scenario definition, pinned to the
 * document types in `types/sdcpn`. A scenario saved with `initialState.type
 * "adhoc"` carries this state verbatim; the scenario's `scenarioParameters`
 * and `parameterOverrides` are derived from it on save.
 */

import { z } from "zod";

import type {
  AdHocPlaceState,
  AdHocScenarioState,
} from "../../../../types/sdcpn";

const optimizeSettingsSchema = z.strictObject({
  min: z.string(),
  max: z.string(),
  scale: z.enum(["linear", "log"]),
  step: z.string().optional(),
});

const valueShape = {
  expression: z.string(),
  optimize: optimizeSettingsSchema.nullable(),
  retainedOptimize: optimizeSettingsSchema.optional(),
};

const valueSchema = z.strictObject(valueShape);

const variableSchema = z.strictObject({
  ...valueShape,
  name: z.string(),
  type: z.enum(["real", "integer", "boolean"]),
  exposed: z.boolean().optional(),
});

const rowSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fixed"),
    cells: z.array(valueSchema),
    retainedCount: valueSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("template"),
    count: valueSchema,
    cells: z.array(valueSchema),
  }),
]);

const placeStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("coloured"),
    variables: z.array(variableSchema),
    rows: z.array(rowSchema),
    sharedColumns: z.record(z.string(), valueSchema),
    retainedSharedColumns: z.record(z.string(), valueSchema).optional(),
  }),
  z.strictObject({
    kind: z.literal("uncoloured"),
    count: valueSchema,
  }),
]) satisfies z.ZodType<AdHocPlaceState>;

export const adHocScenarioStateSchema = z
  .strictObject({
    variables: z.array(variableSchema),
    netParameters: z.array(
      z.strictObject({
        ...valueShape,
        parameterId: z.string(),
      }),
    ),
    places: z.record(z.string(), placeStateSchema),
  })
  .meta({
    description:
      "An ad-hoc scenario definition as the in-app form edits it: every value is an expression, Variables exist at the top level (exposed ones become scenario parameters) and per coloured place, rows are fixed or dynamic, and columns may share one value. Authored by the form — prefer per_place or code when creating scenarios programmatically.",
  }) satisfies z.ZodType<AdHocScenarioState>;
