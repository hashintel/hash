import { ACTUAL_MODE_RECORDING_VERSION } from "./constants";

import type { SDCPN } from "../types/sdcpn";

/**
 * Host-provided live execution state for Petrinaut's Actual mode.
 *
 * Core owns the transport-neutral execution primitives. React packages provide
 * the concrete context/provider surface for UI consumption.
 */

export type ActualModeTokenColour = Record<string, number>;

export type ActualModeMarking = Record<
  string,
  number | ActualModeTokenColour[]
>;

export type ActualModeTransitionEffect = Record<string, number>;

export type ActualModeTransitionFiring = {
  transitionId: string;
  input: ActualModeTransitionEffect;
  output: ActualModeTransitionEffect;
  ts: string;
};

/**
 * The host's execution source. Petrinaut treats both fields as opaque.
 */
export type ActualModeSource = {
  /** Unique per execution; a new id starts a new timeline. */
  id: string;
  /** Human-readable provenance, such as a run name or URL, kept in recordings. */
  label?: string;
};

export type ActualModeRecording = {
  version: typeof ACTUAL_MODE_RECORDING_VERSION;
  exportedAt: string;
  title: string | null;
  source: ActualModeSource | null;
  definition: SDCPN;
  initialState: ActualModeMarking;
  transitionFirings: ActualModeTransitionFiring[];
};

export type ActualModeContextValue =
  | {
      available: false;
      source: null;
      status: "unavailable";
      title: null;
      definition: null;
      initialState: null;
      transitionFirings: readonly [];
      timelineStartedAtMs: null;
      timelineNowMs: null;
      error: null;
    }
  | {
      available: true;
      source: ActualModeSource;
      status: "loading" | "streaming" | "complete" | "error";
      title: string | null;
      definition: SDCPN | null;
      initialState: ActualModeMarking | null;
      transitionFirings: readonly ActualModeTransitionFiring[];
      timelineStartedAtMs: number | null;
      timelineNowMs: number | null;
      error: string | null;
    };

export type ActualModeTimelinePointKind =
  | "initial"
  | "transition_firing"
  | "tick";

export type ActualModeTimelinePoint = {
  kind: ActualModeTimelinePointKind;
  timeMs: number;
  transitionFiringIndex: number | null;
};
