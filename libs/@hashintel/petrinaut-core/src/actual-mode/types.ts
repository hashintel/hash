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

export type ActualModeReceivedEvent = {
  event: string;
  data: unknown;
};

export type ActualModeSource = {
  kind: "brunch";
  endpoint: string;
  runId?: string;
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

export type ActualModeReceivedEventsRecording = {
  version: typeof ACTUAL_MODE_RECORDING_VERSION;
  exportedAt: string;
  title: string | null;
  source: ActualModeSource | null;
  events: ActualModeReceivedEvent[];
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
      receivedEvents: readonly [];
      currentFrameIndex: 0;
      timelineStartedAtMs: null;
      timelineNowMs: null;
      setCurrentFrameIndex: (frameIndex: number) => void;
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
      receivedEvents: readonly ActualModeReceivedEvent[];
      currentFrameIndex: number;
      timelineStartedAtMs: number | null;
      timelineNowMs: number | null;
      setCurrentFrameIndex: (frameIndex: number) => void;
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
