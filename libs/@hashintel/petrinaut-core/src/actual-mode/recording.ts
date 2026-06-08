import { ACTUAL_MODE_RECORDING_VERSION } from "./constants";
import { actualModeRecordingSchema } from "./schemas";
import { parseRequiredActualModeTimestampMs } from "./time";

import type { SDCPN } from "../types/sdcpn";
import type {
  ActualModeMarking,
  ActualModeReceivedEvent,
  ActualModeReceivedEventsRecording,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTransitionFiring,
} from "./types";

export const createActualModeRecording = (params: {
  title: string | null;
  source: ActualModeSource | null;
  definition: SDCPN;
  initialState: ActualModeMarking;
  transitionFirings: readonly ActualModeTransitionFiring[];
  exportedAt?: string;
}): ActualModeRecording => ({
  version: ACTUAL_MODE_RECORDING_VERSION,
  exportedAt: params.exportedAt ?? new Date().toISOString(),
  title: params.title,
  source: params.source,
  definition: params.definition,
  initialState: params.initialState,
  transitionFirings: params.transitionFirings.map((firing) => ({ ...firing })),
});

export const createActualModeReceivedEventsRecording = (params: {
  title: string | null;
  source: ActualModeSource | null;
  events: readonly ActualModeReceivedEvent[];
  exportedAt?: string;
}): ActualModeReceivedEventsRecording => ({
  version: ACTUAL_MODE_RECORDING_VERSION,
  exportedAt: params.exportedAt ?? new Date().toISOString(),
  title: params.title,
  source: params.source,
  events: params.events.map((event) => ({
    event: event.event,
    data: event.data,
  })),
});

export const parseActualModeRecording = (data: unknown): ActualModeRecording =>
  actualModeRecordingSchema.parse(data);

export const retimeActualModeRecordingForReplay = (
  recording: ActualModeRecording,
  launchTimeMs = Date.now(),
): ActualModeRecording => {
  const firstFiring = recording.transitionFirings[0];

  if (!firstFiring) {
    return { ...recording, transitionFirings: [] };
  }

  const firstTimestampMs = parseRequiredActualModeTimestampMs(firstFiring.ts);
  const deltaMs = launchTimeMs - firstTimestampMs;

  return {
    ...recording,
    transitionFirings: recording.transitionFirings.map((firing) => ({
      ...firing,
      ts: new Date(
        parseRequiredActualModeTimestampMs(firing.ts) + deltaMs,
      ).toISOString(),
    })),
  };
};
