import type { SDCPN } from "./types/sdcpn";

/**
 * Host-provided live execution state for Petrinaut's Actual mode.
 *
 * Core owns the transport-neutral data contract. React packages provide the
 * concrete context/provider surface for UI consumption.
 */

export type ActualModeTokenColour = Record<string, number>;

export type ActualModeMarking = Record<
  string,
  number | ActualModeTokenColour[]
>;

export type ActualModeTransitionFiring = {
  transitionId: string;
  input: ActualModeMarking;
  output: ActualModeMarking;
  ts: string;
};

export type ActualModeSource = {
  kind: "brunch";
  endpoint: string;
  runId?: string;
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
      error: string | null;
    };

export const unavailableActualMode: ActualModeContextValue = {
  available: false,
  source: null,
  status: "unavailable",
  title: null,
  definition: null,
  initialState: null,
  transitionFirings: [],
  error: null,
};
