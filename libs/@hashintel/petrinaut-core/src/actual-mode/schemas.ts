import { z } from "zod";

import { sdcpnSchema } from "../file-format/types";
import { ACTUAL_MODE_RECORDING_VERSION } from "./constants";

import type { SDCPN } from "../types/sdcpn";
import type {
  ActualModeMarking,
  ActualModeReceivedEvent,
  ActualModeReceivedEventsRecording,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTransitionEffect,
  ActualModeTransitionFiring,
} from "./types";

const actualModeTokenColourSchema = z.record(z.string(), z.number());
const actualModeMarkingValueSchema = z.union([
  z.number(),
  z.array(actualModeTokenColourSchema),
]);

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
    ts: z.string(),
  })
  .strict();

/**
 * Root schema for Actual Mode transition events.
 *
 * This is the only accepted `transition_firing` payload shape for this PR:
 * `input` contains consumed token counts, `output` contains produced token
 * counts, and neither field carries a full before or after marking.
 */
export const actualModeTransitionFiringSchema =
  actualModeTransitionFiringEffectSchema satisfies z.ZodType<ActualModeTransitionFiring>;

export const actualModeSourceSchema = z.object({
  kind: z.literal("brunch"),
  endpoint: z.string(),
  runId: z.string().optional(),
}) satisfies z.ZodType<ActualModeSource>;

export const actualModeReceivedEventSchema = z
  .object({
    event: z.string(),
    data: z.unknown(),
  })
  .strict() satisfies z.ZodType<ActualModeReceivedEvent>;

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
  version: z.literal(ACTUAL_MODE_RECORDING_VERSION),
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  definition: actualModeRecordingDefinitionSchema,
  initialState: actualModeMarkingSchema,
  transitionFirings: z.array(actualModeTransitionFiringSchema),
}) satisfies z.ZodType<ActualModeRecording>;

export const actualModeReceivedEventsRecordingSchema = z.object({
  version: z.literal(ACTUAL_MODE_RECORDING_VERSION),
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  events: z.array(actualModeReceivedEventSchema),
}) satisfies z.ZodType<ActualModeReceivedEventsRecording>;
