import { z } from "zod";

import { sdcpnSchema } from "../file-format/types";
import { SUPPORTED_ACTUAL_MODE_RECORDING_VERSIONS } from "./constants";
import { normalizeActualModeTransitionFiring } from "./firing";

import type { SDCPN } from "../types/sdcpn";
import type {
  ActualModeMarking,
  ActualModeReceivedEvent,
  ActualModeReceivedEventsRecording,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTokenValues,
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
 * Attribute values of the tokens a firing consumed or produced, keyed by
 * place id. A record may carry a subset of the colour's attributes — at least
 * the identity key elements — and the wire format is JSON, so `uuid` values
 * are canonical lowercase strings.
 */
export const actualModeTokenValuesSchema = z.record(
  z.string(),
  z.array(actualModeTokenRecordSchema),
) satisfies z.ZodType<ActualModeTokenValues>;

/**
 * Root schema for an Actual Mode marking.
 *
 * This validates `initial_state` stream frames and recording snapshots. A
 * place is either a token count or an array of token records.
 */
export const actualModeMarkingSchema = z.record(
  z.string(),
  actualModeMarkingValueSchema,
) satisfies z.ZodType<ActualModeMarking>;

const actualModeLegacyTokenCountsSchema = z.record(z.string(), z.number());

/**
 * Root schema for Actual Mode transition events.
 *
 * A `transition_firing` payload names the transition and the tokens it
 * consumed (`inputTokens`) and produced (`outputTokens`), keyed by place id;
 * neither field is a full before or after marking. Count-only payloads with
 * `input`/`output` count maps, as older emitters and version-1 and version-2
 * recordings carry, parse to the same shape through
 * `normalizeActualModeTransitionFiring`.
 */
export const actualModeTransitionFiringSchema = z
  .object({
    transitionId: z.string(),
    input: actualModeLegacyTokenCountsSchema.optional(),
    output: actualModeLegacyTokenCountsSchema.optional(),
    inputTokens: actualModeTokenValuesSchema.optional(),
    outputTokens: actualModeTokenValuesSchema.optional(),
    ts: z.string(),
  })
  .strict()
  .transform(
    normalizeActualModeTransitionFiring,
  ) satisfies z.ZodType<ActualModeTransitionFiring>;

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
 * Accepts every supported recording version, so an unsupported version fails
 * here rather than as a nested error. Firings from every version parse
 * through `actualModeTransitionFiringSchema`, which normalizes the count-only
 * forms of versions 1 and 2.
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
