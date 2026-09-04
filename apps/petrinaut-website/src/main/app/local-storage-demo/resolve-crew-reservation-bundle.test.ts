import { describe, expect, test } from "vitest";

import {
  latestRunbookIrBlock,
  preparedWorkpieceAuthorship,
  preparedWorkpieceClaimBoundary,
  preparedWorkpieceSignalTag,
} from "@hashintel/brunch-agent/workpiece";

import {
  asCanonicalConversationId,
  asConversationOffset,
  asFlueMessageId,
  asFlueSubmissionId,
  asManifestId,
  sha256Digest,
  type CrewReservationSettledManifest,
} from "./crew-reservation-settled-manifest";
import {
  crewReservationConversationId,
  crewReservationDocumentId,
  crewReservationFixtureId,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
} from "./prepared-crew-reservation-fixture";
import {
  resolveCrewReservationBundle,
  workpieceForCrewReservationBundle,
} from "./resolve-crew-reservation-bundle";

import type { CrewReservationHistory } from "./crew-reservation-history";
import type { SDCPNInLocalStorage } from "./use-local-storage-sdcpns";

const preparedMessage = {
  id: "prepared-message",
  role: "system",
  purpose: "dispatch",
  submissionId: "prepare-submission",
  signal: {
    tagName: preparedWorkpieceSignalTag,
    attributes: {
      fixtureId: crewReservationFixtureId,
      authorship: preparedWorkpieceAuthorship,
      claimBoundary: preparedWorkpieceClaimBoundary,
    },
  },
  parts: [{ type: "text", text: preparedCrewReservationWorkpiece }],
} as const;

const preparedContent = latestRunbookIrBlock(preparedCrewReservationWorkpiece);
if (preparedContent === undefined) {
  throw new Error("The prepared fixture has no runbook-ir workpiece.");
}

const manifest: CrewReservationSettledManifest = {
  version: 1,
  fixtureId: crewReservationFixtureId,
  manifestId: asManifestId("manifest"),
  revision: 0,
  settledAt: "2026-09-04T08:00:00.000Z",
  conversation: {
    canonicalId: asCanonicalConversationId("canonical"),
    logicalId: crewReservationConversationId,
    offset: asConversationOffset("2"),
  },
  document: {
    id: crewReservationDocumentId,
    sha256: sha256Digest(JSON.stringify(preparedCrewReservationNet)),
    targetArc: "absent",
  },
  latestWorkpiece: {
    authorship: "test-authored",
    contentSha256: sha256Digest(preparedContent),
    sourceKind: "prepared-signal",
    sourceMessageId: asFlueMessageId(preparedMessage.id),
    sourceMessageSha256: sha256Digest(JSON.stringify(preparedMessage)),
    sourceSubmissionId: asFlueSubmissionId(preparedMessage.submissionId),
  },
};

const fallbackDocument: SDCPNInLocalStorage = {
  id: crewReservationDocumentId,
  title: "Prepared",
  sdcpn: preparedCrewReservationNet,
  lastUpdated: "1970-01-01T00:00:00.000Z",
};

const history: CrewReservationHistory = {
  conversationId: "canonical",
  offset: "3",
  settlements: [],
  messages: [
    preparedMessage,
    {
      id: "newer-message",
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "text",
          text: "```runbook-ir\n# Unsettled newer workpiece\n```",
        },
      ],
    },
  ],
};

describe("resolveCrewReservationBundle", () => {
  test("selects a coherent document whose content matches the manifest digest", () => {
    const partialDefinition = structuredClone(preparedCrewReservationNet);
    const firstPlace = partialDefinition.places.at(0);
    if (firstPlace === undefined) {
      throw new Error("The prepared fixture has no places.");
    }
    firstPlace.name = "Partial write";

    const selection = resolveCrewReservationBundle({
      fallbackDocument,
      manifest,
      storedDocument: {
        ...fallbackDocument,
        sdcpn: partialDefinition,
        coherentSnapshots: {
          [manifest.document.sha256]: preparedCrewReservationNet,
        },
      },
    });

    expect(selection.snapshotMissing).toBe(false);
    expect(selection.selectedDocument.sdcpn).toEqual(
      preparedCrewReservationNet,
    );
    expect(selection.selectedDocument.sdcpn).not.toEqual(partialDefinition);
  });

  test("refuses a snapshot stored under a digest that its content does not match", () => {
    const corruptedSnapshot = structuredClone(preparedCrewReservationNet);
    const firstPlace = corruptedSnapshot.places.at(0);
    if (firstPlace === undefined) {
      throw new Error("The prepared fixture has no places.");
    }
    firstPlace.name = "Corrupted snapshot";

    const selection = resolveCrewReservationBundle({
      fallbackDocument,
      manifest,
      storedDocument: {
        ...fallbackDocument,
        coherentSnapshots: {
          [manifest.document.sha256]: corruptedSnapshot,
        },
      },
    });

    expect(selection.snapshotMissing).toBe(true);
    expect(selection.selectedDocument.sdcpn).toEqual(fallbackDocument.sdcpn);
    expect(selection.selectedDocument.sdcpn).not.toEqual(corruptedSnapshot);
  });

  test("keeps a missing snapshot diagnosable without inventing a revision", () => {
    expect(
      resolveCrewReservationBundle({
        fallbackDocument,
        manifest,
        storedDocument: fallbackDocument,
      }),
    ).toEqual({
      selectedDocument: fallbackDocument,
      snapshotMissing: true,
    });
  });
});

describe("workpieceForCrewReservationBundle", () => {
  test("selects the source whose content and record match the manifest hashes", () => {
    expect(workpieceForCrewReservationBundle(history, manifest)).toContain(
      "# Final inspection and dispatch workpiece",
    );
  });

  test("refuses a selected source whose manifest hash does not match", () => {
    expect(
      workpieceForCrewReservationBundle(history, {
        ...manifest,
        latestWorkpiece: {
          ...manifest.latestWorkpiece,
          sourceMessageSha256: sha256Digest("mismatched source"),
        },
      }),
    ).toBeUndefined();
  });
});
