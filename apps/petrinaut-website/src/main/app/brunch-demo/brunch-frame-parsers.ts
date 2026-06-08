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

const parseJsonEventData = (event: MessageEvent, label: string): unknown => {
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

export const parseDefinitionFrame = (
  event: MessageEvent,
): BrunchNetDefinition => {
  const data = parseJsonEventData(event, "definition");
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

export const parseMarkingFrame = (event: MessageEvent): ActualModeMarking => {
  const data = parseJsonEventData(event, "initial_state");
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

export const parseTransitionFiringFrame = (
  event: MessageEvent,
): ActualModeTransitionFiring => {
  const data = parseJsonEventData(event, "transition_firing");
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
