import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  CREW_RESERVATION_CONVERSATION_ID,
  CREW_RESERVATION_DOCUMENT_ID,
  CREW_RESERVATION_FIXTURE_ID,
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
          fixtureId: CREW_RESERVATION_FIXTURE_ID,
          revision: 3,
          settledAt: "2026-09-03T15:00:00.000Z",
          manifestId: "manifest-3",
          conversation: {
            logicalId: CREW_RESERVATION_CONVERSATION_ID,
            canonicalId: "canonical-conversation",
            offset: "20",
          },
          latestWorkpiece: {
            authorship: "model-produced",
            contentSha256: "content-hash",
            sourceKind: "assistant",
            sourceMessageId: "assistant-3",
            sourceMessageSha256: "message-hash",
            sourceSubmissionId: "submission-3",
          },
          document: {
            id: CREW_RESERVATION_DOCUMENT_ID,
            sha256: "document-hash",
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
