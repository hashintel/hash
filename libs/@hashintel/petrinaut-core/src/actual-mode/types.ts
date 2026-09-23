import type { SDCPN } from "../types/sdcpn";
import type { ACTUAL_MODE_RECORDING_VERSION } from "./constants";

/**
 * Host-provided live execution state for Petrinaut's Actual mode.
 *
 * Core owns the transport-neutral execution primitives. React packages provide
 * the concrete context/provider surface for UI consumption.
 */

export type ActualModeTokenColour = Record<string, number>;

/**
 * At-rest token attribute value in a firing record or reconstructed marking.
 * The wire format is JSON, so `uuid` values are canonical lowercase strings,
 * as in documents.
 */
type ActualModeTokenValue = number | boolean | string;

export type ActualModeTokenRecord = Record<string, ActualModeTokenValue>;

export type ActualModeMarking = Record<
  string,
  number | ActualModeTokenRecord[]
>;

/**
 * Attribute values of the tokens a firing consumed or produced, keyed by
 * placeId, or `instanceId::placeId` for a componentInstance's copy of a subnet
 * place (see `scoped-ids.ts`). A record for a place with a colour carries
 * exactly the colour's elements, each an at-rest value of the element's type;
 * a record for an uncoloured place is `{}`.
 */
export type ActualModeTokenValues = Record<string, ActualModeTokenRecord[]>;

export type ActualModeTransitionFiring = {
  /** Scoped id (`instanceId::transitionId`) when inside a component instance. */
  transitionId: string;
  inputTokens: ActualModeTokenValues;
  outputTokens: ActualModeTokenValues;
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

export type ActualModeRecordingVersion = typeof ACTUAL_MODE_RECORDING_VERSION;

export type ActualModeRecording = {
  version: ActualModeRecordingVersion;
  exportedAt: string;
  title: string | null;
  source: ActualModeSource | null;
  definition: SDCPN;
  initialState: ActualModeMarking;
  transitionFirings: ActualModeTransitionFiring[];
};

export type ActualModeReceivedEventsRecording = {
  version: ActualModeRecordingVersion;
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
      receivedEvents: readonly ActualModeReceivedEvent[];
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
