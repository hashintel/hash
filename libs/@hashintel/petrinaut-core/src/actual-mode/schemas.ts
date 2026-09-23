import { z } from "zod";

import { sdcpnSchema } from "../file-format/types";
import { ACTUAL_MODE_RECORDING_VERSION } from "./constants";
import { applyActualModeTransitionFiring } from "./marking";
import { validateActualModeInitialState } from "./token-records";

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

const actualModeTokenValueSchema = z.union([
  z.number(),
  z.boolean(),
  z.string(),
]);
const actualModeTokenRecordSchema = z.record(
  z.string(),
  actualModeTokenValueSchema,
);
const actualModeMarkingValueSchema = z.union([
  z.number(),
  z.array(actualModeTokenRecordSchema),
]);

/**
 * Attribute values of the tokens a firing consumed or produced, keyed by
 * place id. The schema checks the JSON shape only; whether each record fits
 * its place needs the net, so `validateActualModeTransitionFiring` checks it.
 */
export const actualModeTokenValuesSchema = z.record(
  z.string(),
  z.array(actualModeTokenRecordSchema),
) satisfies z.ZodType<ActualModeTokenValues>;

/**
 * Root schema for an Actual Mode marking.
 *
 * This validates `initial_state` stream frames and recording snapshots. A
 * place is either a token count or an array of token records; whether each
 * record fits its place needs the net, so `validateActualModeInitialState`
 * checks it.
 */
export const actualModeMarkingSchema = z.record(
  z.string(),
  actualModeMarkingValueSchema,
) satisfies z.ZodType<ActualModeMarking>;

/**
 * Root schema for Actual Mode transition events.
 *
 * A `transition_firing` payload names the transition and the tokens it
 * consumed (`inputTokens`) and produced (`outputTokens`), keyed by place id;
 * neither field is a full before or after marking.
 */
export const actualModeTransitionFiringSchema = z
  .object({
    transitionId: z.string(),
    inputTokens: actualModeTokenValuesSchema,
    outputTokens: actualModeTokenValuesSchema,
    ts: z.string(),
  })
  .strict() satisfies z.ZodType<ActualModeTransitionFiring>;

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

const actualModeRecordingVersionSchema = z.literal(
  ACTUAL_MODE_RECORDING_VERSION,
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
 * Every token record must fit its place in the recording's definition, and
 * the firings must replay against the initial marking: the first record or
 * firing that fails either check fails validation.
 */
export const actualModeRecordingSchema = z
  .object({
    version: actualModeRecordingVersionSchema,
    exportedAt: z.string(),
    title: z.string().nullable(),
    source: actualModeSourceSchema.nullable(),
    definition: actualModeRecordingDefinitionSchema,
    initialState: actualModeMarkingSchema,
    transitionFirings: z.array(actualModeTransitionFiringSchema),
  })
  .superRefine((recording, context) => {
    try {
      validateActualModeInitialState(
        recording.definition,
        recording.initialState,
      );
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["initialState"],
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let marking: ActualModeMarking = recording.initialState;
    for (const [index, firing] of recording.transitionFirings.entries()) {
      try {
        marking = applyActualModeTransitionFiring(
          recording.definition,
          marking,
          firing,
        );
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["transitionFirings", index],
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
  }) satisfies z.ZodType<ActualModeRecording>;

export const actualModeReceivedEventsRecordingSchema = z.object({
  version: actualModeRecordingVersionSchema,
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  events: z.array(actualModeReceivedEventSchema),
}) satisfies z.ZodType<ActualModeReceivedEventsRecording>;
