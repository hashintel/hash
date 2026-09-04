import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  asCanonicalConversationId,
  asConversationOffset,
  asFlueMessageId,
  asFlueSubmissionId,
  asManifestId,
  asSha256Digest,
} from "./crew-reservation-settled-manifest";
import {
  crewReservationConversationId,
  crewReservationDocumentId,
  crewReservationFixtureId,
} from "./prepared-crew-reservation-fixture";
import {
  PreparedFixtureBanner,
  PreparedFixtureSelector,
} from "./prepared-fixture-banner";

describe("PreparedFixtureBanner", () => {
  test("offers a stable labelled fixture selector", () => {
    const markup = renderToStaticMarkup(<PreparedFixtureSelector />);

    expect(markup).toContain("Prepared fixture selector");
    expect(markup).toContain("Open the labelled crew-reservation fixture");
    expect(markup).toContain("?brunch-fixture=crew-reservation-v1");
  });

  test("visibly states authorship, non-claims, and automatic settlement", () => {
    const markup = renderToStaticMarkup(
      <PreparedFixtureBanner settledManifest={null} />,
    );

    expect(markup).toContain("Test-authored prepared fixture");
    expect(markup).toContain("not model-produced evidence");
    expect(markup).toContain("does not claim capture provenance");
    expect(markup).toContain("automatically mirrored document");
    expect(markup).toContain("Current Markdown workpiece");
    expect(markup).toContain("Final inspection and dispatch workpiece");
  });

  test("visibly retains the prior bundle when settlement is refused", () => {
    const markup = renderToStaticMarkup(
      <PreparedFixtureBanner
        settledManifest={{
          version: 1,
          fixtureId: crewReservationFixtureId,
          revision: 3,
          settledAt: "2026-09-03T15:00:00.000Z",
          manifestId: asManifestId("manifest-3"),
          conversation: {
            logicalId: crewReservationConversationId,
            canonicalId: asCanonicalConversationId("canonical-conversation"),
            offset: asConversationOffset("20"),
          },
          latestWorkpiece: {
            authorship: "model-produced",
            contentSha256: asSha256Digest("content-hash"),
            sourceKind: "assistant",
            sourceMessageId: asFlueMessageId("assistant-3"),
            sourceMessageSha256: asSha256Digest("message-hash"),
            sourceSubmissionId: asFlueSubmissionId("submission-3"),
          },
          document: {
            id: crewReservationDocumentId,
            sha256: asSha256Digest("document-hash"),
            targetArc: "present",
          },
        }}
        settlementStatus={{
          state: "refused",
          reason: "missing-correlated-mutation",
        }}
      />,
    );

    expect(markup).toContain(
      "Settlement refused (missing-correlated-mutation)",
    );
    expect(markup).toContain("bundle revision 3 remains selected");
  });
});
