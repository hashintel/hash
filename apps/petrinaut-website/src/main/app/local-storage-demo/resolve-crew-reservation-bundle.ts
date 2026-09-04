import {
  latestRunbookIrBlock,
  selectRunbookWorkpiece,
} from "@hashintel/brunch-agent/workpiece";

import {
  sha256Digest,
  type CrewReservationSettledManifest,
} from "./crew-reservation-settled-manifest";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { SDCPNInLocalStorage } from "./use-local-storage-sdcpns";

export interface CrewReservationBundleSelection {
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
      selectedDocument: liveDocument,
      snapshotMissing: false,
    };
  }

  const coherentDefinition =
    liveDocument.coherentSnapshots?.[input.manifest.document.sha256];
  if (
    coherentDefinition === undefined ||
    sha256Digest(JSON.stringify(coherentDefinition)) !==
      input.manifest.document.sha256
  ) {
    return {
      selectedDocument: liveDocument,
      snapshotMissing: true,
    };
  }

  return {
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

  const selectedMessageIndex = history.messages.findIndex(
    ({ id }) => id === manifest.latestWorkpiece.sourceMessageId,
  );
  if (selectedMessageIndex === -1) return undefined;
  const selectedMessage = history.messages[selectedMessageIndex];
  if (selectedMessage === undefined) return undefined;

  const content = latestRunbookIrBlock(
    selectedMessage.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n"),
  );
  if (
    content === undefined ||
    sha256Digest(content) !== manifest.latestWorkpiece.contentSha256 ||
    sha256Digest(JSON.stringify(selectedMessage)) !==
      manifest.latestWorkpiece.sourceMessageSha256
  ) {
    return undefined;
  }

  const selectedWorkpiece = selectRunbookWorkpiece({
    ...history,
    messages: history.messages.slice(0, selectedMessageIndex + 1),
  });
  if (
    selectedWorkpiece?.sourceMessageId !==
      manifest.latestWorkpiece.sourceMessageId ||
    selectedWorkpiece.sourceSubmissionId !==
      manifest.latestWorkpiece.sourceSubmissionId ||
    selectedWorkpiece.authorship !== manifest.latestWorkpiece.authorship ||
    selectedWorkpiece.sourceKind !== manifest.latestWorkpiece.sourceKind
  ) {
    return undefined;
  }

  return content;
};
