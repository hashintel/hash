import {
  createActualModeRecording,
  type ActualModeMarking,
  type ActualModeSource,
  type ActualModeTransitionFiring,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { downloadBlob, timestampedFilename } from "../lib/download-blob";

export function exportActualModeRecording({
  definition,
  initialState,
  source,
  title,
  transitionFirings,
}: {
  definition: SDCPN;
  initialState: ActualModeMarking;
  source: ActualModeSource | null;
  title: string | null;
  transitionFirings: readonly ActualModeTransitionFiring[];
}): void {
  const recording = createActualModeRecording({
    title,
    source,
    definition,
    initialState,
    transitionFirings,
  });

  downloadBlob({
    content: JSON.stringify(recording, null, 2),
    mimeType: "application/json",
    filename: timestampedFilename(
      title ?? "actual-mode-recording",
      "petrinaut-actual.json",
    ),
  });
}
