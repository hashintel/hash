import { describe, expect, test } from "vitest";

import {
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
  asSha256Digest,
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

import type { SDCPNInLocalStorage } from "./use-local-storage-sdcpns";

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
    sha256: asSha256Digest("coherent-hash"),
    targetArc: "absent",
  },
  latestWorkpiece: {
    authorship: "test-authored",
    contentSha256: asSha256Digest("content"),
    sourceKind: "prepared-signal",
    sourceMessageId: asFlueMessageId("prepared-message"),
    sourceMessageSha256: asSha256Digest("message"),
    sourceSubmissionId: asFlueSubmissionId("prepare-submission"),
  },
};

const fallbackDocument: SDCPNInLocalStorage = {
  id: crewReservationDocumentId,
  title: "Prepared",
  sdcpn: preparedCrewReservationNet,
  lastUpdated: "1970-01-01T00:00:00.000Z",
};

describe("resolveCrewReservationBundle", () => {
  test("selects the content-addressed coherent document over a partial mirror", () => {
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
          "coherent-hash": preparedCrewReservationNet,
        },
      },
    });

    expect(selection.snapshotMissing).toBe(false);
    expect(selection.selectedDocument.sdcpn).toEqual(
      preparedCrewReservationNet,
    );
    expect(selection.selectedDocument.sdcpn).not.toEqual(partialDefinition);
    expect(selection.observedDocument.sdcpn).toEqual(partialDefinition);
  });

  test("keeps a missing snapshot diagnosable without inventing a revision", () => {
    const selection = resolveCrewReservationBundle({
      fallbackDocument,
      manifest,
      storedDocument: fallbackDocument,
    });

    expect(selection).toEqual({
      observedDocument: fallbackDocument,
      selectedDocument: fallbackDocument,
      snapshotMissing: true,
    });
  });
});

test("selects the workpiece source named by the settled manifest", () => {
  const newerWorkpiece = "```runbook-ir\n# Unsettled newer workpiece\n```";
  expect(
    workpieceForCrewReservationBundle(
      {
        conversationId: "canonical",
        offset: "3",
        settlements: [],
        messages: [
          {
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
            parts: [
              {
                type: "text",
                text: preparedCrewReservationWorkpiece,
              },
            ],
          },
          {
            id: "newer-message",
            role: "assistant",
            purpose: "assistant",
            parts: [{ type: "text", text: newerWorkpiece }],
          },
        ],
      },
      manifest,
    ),
  ).toContain("# Final inspection and dispatch workpiece");
});
