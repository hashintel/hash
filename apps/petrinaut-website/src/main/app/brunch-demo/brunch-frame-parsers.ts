import { z } from "zod";

import {
  actualModeMarkingSchema,
  actualModeTransitionFiringSchema,
} from "@hashintel/petrinaut-core";

import { brunchNetDefinitionSchema } from "./brunch-protocol";

import type { BrunchNetDefinition } from "./brunch-protocol";
import type {
  ActualModeMarking,
  ActualModeTransitionFiring,
} from "@hashintel/petrinaut-core";

/**
 * Decode the string payload from an EventSource MessageEvent.
 *
 * This is the first parsing stage in the Brunch stream handler. It does not
 * validate the payload shape; it only turns SSE `data:` text into JSON so the
 * frame-specific parsers can validate it against the expected protocol schema.
 */
export const parseJsonEventData = (
  event: MessageEvent,
  label: string,
): unknown => {
  try {
    return JSON.parse(event.data as string) as unknown;
  } catch (err) {
    throw new Error(
      `${label} frame is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
};

const summarizeZodError = (error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join(", ");

/**
 * Validate a decoded Brunch `definition` payload.
 *
 * This runs after JSON decoding and before the website normalizes the temporary
 * Brunch execution-plan shape into a read-only Petrinaut SDCPN for rendering.
 * The current Brunch fixture may send either the definition directly or wrap it
 * as `{ definition }`, so this accepts both forms.
 */
export const parseDefinitionFrameData = (
  data: unknown,
): BrunchNetDefinition => {
  const candidate =
    typeof data === "object" && data !== null && "definition" in data
      ? (data as { definition: unknown }).definition
      : data;
  const result = brunchNetDefinitionSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch definition frame: ${summarizeZodError(result.error)}`,
    );
  }

  return result.data;
};

/**
 * Convenience parser for EventSource `definition` events.
 *
 * Use this when a caller only needs the validated Brunch definition and does
 * not need to retain the decoded raw JSON payload for export.
 */
export const parseDefinitionFrame = (
  event: MessageEvent,
): BrunchNetDefinition =>
  parseDefinitionFrameData(parseJsonEventData(event, "definition"));

/**
 * Validate a decoded Brunch `initial_state` payload.
 *
 * This runs after JSON decoding and before the provider stores the initial
 * Actual Mode marking in context. The current fixture may send either the
 * marking directly or wrap it as `{ initialState }`, so this accepts both forms.
 */
export const parseMarkingFrameData = (data: unknown): ActualModeMarking => {
  const candidate =
    typeof data === "object" && data !== null && "initialState" in data
      ? (data as { initialState: unknown }).initialState
      : data;
  const result = actualModeMarkingSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch initial_state frame: ${summarizeZodError(result.error)}`,
    );
  }

  return result.data;
};

/**
 * Convenience parser for EventSource `initial_state` events.
 *
 * Use this when a caller only needs the validated marking and does not need to
 * retain the decoded raw JSON payload for export.
 */
export const parseMarkingFrame = (event: MessageEvent): ActualModeMarking =>
  parseMarkingFrameData(parseJsonEventData(event, "initial_state"));

/**
 * Validate a decoded Brunch `transition_firing` payload.
 *
 * This runs after JSON decoding and before the provider appends the event to
 * Actual Mode state. The accepted schema is the transition effect protocol:
 * `{ transitionId, input, output, ts }`.
 */
export const parseTransitionFiringFrameData = (
  data: unknown,
): ActualModeTransitionFiring => {
  const result = actualModeTransitionFiringSchema.safeParse(data);

  if (!result.success) {
    throw new Error(
      `Invalid Brunch transition_firing frame: ${summarizeZodError(
        result.error,
      )}`,
    );
  }

  return result.data;
};

/**
 * Convenience parser for EventSource `transition_firing` events.
 *
 * Use this when a caller only needs the validated transition firing and does
 * not need to retain the decoded raw JSON payload for export.
 */
export const parseTransitionFiringFrame = (
  event: MessageEvent,
): ActualModeTransitionFiring =>
  parseTransitionFiringFrameData(
    parseJsonEventData(event, "transition_firing"),
  );
