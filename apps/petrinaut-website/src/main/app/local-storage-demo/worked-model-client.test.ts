import { describe, expect, test, vi } from "vitest";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import {
  createCleanWorkedModelCopy,
  parseWorkedModelCopy,
  resolveWorkedModelCopy,
  updateWorkedModelDefinition,
  workedModelApiUrl,
} from "./worked-model-client";

const copy = {
  bundleKey: "inventory-purchasing",
  copyId: "copy-1",
  conversationId: "conversation-1",
  documentId: "document-1",
  incarnationId: "incarnation-1",
  fixtureVersion: "inventory-purchasing-v1",
  principalKey: "principal-a",
  title: "Inventory purchasing",
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  definitionSha256: "a".repeat(64),
  revisionId: "revision-1",
};

const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("worked-model client", () => {
  test("derives the API origin from relative and remote chat endpoints", () => {
    expect(
      workedModelApiUrl("/agents/chat", "https://petrinaut.example").href,
    ).toBe("https://petrinaut.example/api/worked-models");
    expect(
      workedModelApiUrl(
        "https://brunch.example/agents/chat?ignored=1",
        "https://petrinaut.example",
      ).href,
    ).toBe("https://brunch.example/api/worked-models");
  });

  test("resolves a principal-owned bundle copy", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(copy));
    await expect(
      resolveWorkedModelCopy(
        {
          chatEndpoint: "https://brunch.example/agents/chat",
          currentOrigin: "https://petrinaut.example",
          principalKey: "principal-a",
          bundleKey: "inventory-purchasing",
        },
        fetcher,
      ),
    ).resolves.toMatchObject(copy);
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "https://brunch.example/api/worked-models/bundles/inventory-purchasing",
      ),
      expect.objectContaining({
        method: "GET",
        headers: {
          [BRUNCH_PRINCIPAL_HEADER]: "principal-a",
        },
      }),
    );
  });

  test("creates clean copies and updates definitions through distinct methods", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(copy));
    await createCleanWorkedModelCopy(
      {
        chatEndpoint: "/agents/chat",
        currentOrigin: "https://petrinaut.example",
        principalKey: "principal-a",
        bundleKey: "inventory-purchasing",
      },
      fetcher,
    );
    await updateWorkedModelDefinition(
      {
        chatEndpoint: "/agents/chat",
        currentOrigin: "https://petrinaut.example",
        principalKey: "principal-a",
        copyId: "copy-1",
        expectedSha256: "a".repeat(64),
        expectedRevisionId: "revision-1",
        definition: copy.definition,
        revisionId: "revision-2",
      },
      fetcher,
    );

    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        expectedSha256: "a".repeat(64),
        expectedRevisionId: "revision-1",
        definition: copy.definition,
        revisionId: "revision-2",
      }),
    );
  });

  test("refuses malformed success responses and preserves HTTP failures", async () => {
    expect(() => parseWorkedModelCopy({ ...copy, copyId: "" })).toThrow(
      /copyId/u,
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ error: "bundle-not-found" }, 404),
    );
    await expect(
      resolveWorkedModelCopy(
        {
          chatEndpoint: "/agents/chat",
          currentOrigin: "https://petrinaut.example",
          principalKey: "principal-a",
          bundleKey: "unknown",
        },
        fetcher,
      ),
    ).rejects.toThrow(/404.*bundle-not-found/u);
  });
});
