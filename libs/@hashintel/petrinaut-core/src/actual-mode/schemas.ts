import { z } from "zod";

import { sdcpnSchema } from "../file-format/types";
import { SUPPORTED_ACTUAL_MODE_RECORDING_VERSIONS } from "./constants";

import type { SDCPN } from "../types/sdcpn";
import type {
  ActualModeMarking,
  ActualModeReceivedEvent,
  ActualModeReceivedEventsRecording,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTokenValues,
  ActualModeTransitionEffect,
  ActualModeTransitionFiring,
} from "./types";

const actualModeTokenColourSchema = z.record(z.string(), z.number());
const actualModeMarkingValueSchema = z.union([
  z.number(),
  z.array(actualModeTokenColourSchema),
]);

const actualModeTokenValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
]);
const actualModeTokenRecordSchema = z.record(
  z.string(),
  actualModeTokenValueSchema,
);

/**
 * Attribute values of the tokens a firing consumed or produced, keyed like
 * `input`/`output`. A record may carry a subset of the colour's attributes —
 * at least the identity key elements — and the wire format is JSON, so
 * `uuid` values are canonical lowercase strings.
 */
export const actualModeTokenValuesSchema = z.record(
  z.string(),
  z.array(actualModeTokenRecordSchema),
) satisfies z.ZodType<ActualModeTokenValues>;

/**
 * Root schema for an Actual Mode marking.
 *
 * This validates `initial_state` stream frames and recording snapshots. Places
 * can currently be represented by a numeric token count or by token-colour
 * arrays for future coloured-token support.
 */
export const actualModeMarkingSchema = z.record(
  z.string(),
  actualModeMarkingValueSchema,
) satisfies z.ZodType<ActualModeMarking>;

/**
 * Root schema for a transition-local token effect.
 *
 * This is intentionally not a full marking: keys are only the places affected
 * by a transition, and values are the token counts consumed or produced there.
 */
export const actualModeTransitionEffectSchema = z.record(
  z.string(),
  z.number(),
) satisfies z.ZodType<ActualModeTransitionEffect>;

const actualModeTransitionFiringEffectSchema = z
  .object({
    transitionId: z.string(),
    input: actualModeTransitionEffectSchema,
    output: actualModeTransitionEffectSchema,
    inputTokens: actualModeTokenValuesSchema.optional(),
    outputTokens: actualModeTokenValuesSchema.optional(),
    ts: z.string(),
  })
  .strict();

/**
 * Root schema for Actual Mode transition events.
 *
 * This is the only accepted `transition_firing` payload shape: `input`
 * contains consumed token counts, `output` contains produced token counts,
 * and neither field carries a full before or after marking. The optional
 * `inputTokens`/`outputTokens` carry the attribute values of the consumed
 * and produced tokens, keyed like `input`/`output`.
 */
export const actualModeTransitionFiringSchema =
  actualModeTransitionFiringEffectSchema satisfies z.ZodType<ActualModeTransitionFiring>;

export const actualModeSourceSchema = z
  .object({
    kind: z.literal("brunch"),
    endpoint: z.string(),
    runId: z.string().optional(),
  })
  .strict() satisfies z.ZodType<ActualModeSource>;

export const actualModeReceivedEventSchema = z
  .object({
    event: z.string(),
    data: z.unknown(),
  })
  .strict() satisfies z.ZodType<ActualModeReceivedEvent>;

/**
 * Accepts every supported recording version: version-1 recordings carry no
 * per-firing token values, and version-2 recordings may. An unsupported
 * version fails here explicitly rather than as a confusing nested error.
 */
const actualModeRecordingVersionSchema = z.literal(
  SUPPORTED_ACTUAL_MODE_RECORDING_VERSIONS,
);

const actualModeRecordingDefinitionSchema = z.custom<SDCPN>(
  (value) => sdcpnSchema.safeParse(value).success,
  { message: "Invalid SDCPN definition" },
);

/**
 * Root schema for exported Actual Mode replay recordings.
 *
 * A recording combines the normalized SDCPN, initial marking, source metadata,
 * and ordered transition events needed to reconstruct the timeline offline.
 */
export const actualModeRecordingSchema = z.object({
  version: actualModeRecordingVersionSchema,
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  definition: actualModeRecordingDefinitionSchema,
  initialState: actualModeMarkingSchema,
  transitionFirings: z.array(actualModeTransitionFiringSchema),
}) satisfies z.ZodType<ActualModeRecording>;

export const actualModeReceivedEventsRecordingSchema = z.object({
  version: actualModeRecordingVersionSchema,
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  events: z.array(actualModeReceivedEventSchema),
}) satisfies z.ZodType<ActualModeReceivedEventsRecording>;
