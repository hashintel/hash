import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AnalysisError,
  fetchAnalysisArtifact,
  fetchArtifactJson,
} from "./analysis-client";

import type { WebId } from "@blockprotocol/type-system";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analysis client errors", () => {
  it("preserves a structured optional-artifact-unavailable code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                id: "a0",
                status: "error",
                error: "Optional artifact is not published",
                errorCode: "OPTIONAL_ARTIFACT_UNAVAILABLE",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const pending = fetchAnalysisArtifact({
      analysis: "siteProductionTimeline",
      args: { siteId: "site-a" },
      webId: "00000000-0000-4000-8000-000000000001" as WebId,
    });
    await expect(pending).rejects.toMatchObject({
      code: "OPTIONAL_ARTIFACT_UNAVAILABLE",
      message: "Optional artifact is not published",
    });
  });

  it("keeps an artifact-store 404 retryable and unclassified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    const pending = fetchArtifactJson({
      name: "timeline",
      format: "json",
      url: "https://storage.example/timeline.json",
    });
    await expect(pending).rejects.toBeInstanceOf(AnalysisError);
    await expect(pending).rejects.toMatchObject({ code: undefined });
  });
});
