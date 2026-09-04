import {
  latestRunbookIrBlock,
  selectRunbookWorkpiece,
} from "@hashintel/brunch-agent/workpiece";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { CrewReservationSettledManifest } from "./crew-reservation-settled-manifest";
import type { SDCPNInLocalStorage } from "./use-local-storage-sdcpns";

export interface CrewReservationBundleSelection {
  readonly observedDocument: SDCPNInLocalStorage;
  readonly selectedDocument: SDCPNInLocalStorage;
  readonly snapshotMissing: boolean;
}

export const resolveCrewReservationBundle = (input: {
  readonly fallbackDocument: SDCPNInLocalStorage;
  readonly manifest: CrewReservationSettledManifest | null;
  readonly storedDocument: SDCPNInLocalStorage | undefined;
}): CrewReservationBundleSelection => {
  const liveDocument = input.storedDocument ?? input.fallbackDocument;
  if (input.manifest === null) {
    return {
      observedDocument: liveDocument,
      selectedDocument: liveDocument,
      snapshotMissing: false,
    };
  }

  const coherentDefinition =
    liveDocument.coherentSnapshots?.[input.manifest.document.sha256];
  if (coherentDefinition === undefined) {
    return {
      observedDocument: liveDocument,
      selectedDocument: liveDocument,
      snapshotMissing: true,
    };
  }

  return {
    observedDocument: liveDocument,
    selectedDocument: {
      ...liveDocument,
      sdcpn: coherentDefinition,
    },
    snapshotMissing: false,
  };
};

export const workpieceForCrewReservationBundle = (
  history: CrewReservationHistory | undefined,
  manifest: CrewReservationSettledManifest | null,
): string | undefined => {
  if (history === undefined) return undefined;
  if (manifest === null) return selectRunbookWorkpiece(history)?.content;

  const selectedMessage = history.messages.find(
    ({ id }) => id === manifest.latestWorkpiece.sourceMessageId,
  );
  if (selectedMessage === undefined) return undefined;
  return latestRunbookIrBlock(
    selectedMessage.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n"),
  );
};
