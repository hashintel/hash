import {
  createActualModeRecording,
  createActualModeReceivedEventsRecording,
  type ActualModeMarking,
  type ActualModeReceivedEvent,
  type ActualModeSource,
  type ActualModeTransitionFiring,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { downloadBlob, timestampedFilename } from "../lib/download-blob";

export function exportActualModeRecording({
  definition,
  initialState,
  receivedEvents,
  source,
  title,
  transitionFirings,
}: {
  definition: SDCPN | null;
  initialState: ActualModeMarking | null;
  receivedEvents?: readonly ActualModeReceivedEvent[];
  source: ActualModeSource | null;
  title: string | null;
  transitionFirings: readonly ActualModeTransitionFiring[];
}): void {
  const recording =
    receivedEvents && receivedEvents.length > 0
      ? createActualModeReceivedEventsRecording({
          title,
          source,
          events: receivedEvents,
        })
      : definition && initialState
        ? createActualModeRecording({
            title,
            source,
            definition,
            initialState,
            transitionFirings,
          })
        : null;

  if (!recording) {
    return;
  }

  downloadBlob({
    content: JSON.stringify(recording, null, 2),
    mimeType: "application/json",
    filename: timestampedFilename(
      title ?? "actual-mode-recording",
      "petrinaut-actual.json",
    ),
  });
}
