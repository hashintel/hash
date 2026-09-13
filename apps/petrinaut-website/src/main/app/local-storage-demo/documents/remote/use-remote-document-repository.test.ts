/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useRemoteDocumentRepository } from "./use-remote-document-repository";

const workedModel = vi.hoisted(() => ({
  netProjection: {
    bundleKey: "inventory-purchasing",
    copyId: "private-copy-id",
    conversationId: "conversation-1",
    documentId: "document-1",
    incarnationId: "incarnation-1",
    fixtureVersion: "fixture-v1",
    principalKey: "principal-1",
    title: "Inventory",
    definition: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
    definitionSha256: "a".repeat(64),
    revisionId: "revision-1",
  },
  error: null,
  loading: false,
  createCleanNetProjection: vi.fn(async () => undefined),
  persistDefinition: vi.fn(async () => undefined),
  settleDocumentRevision: vi.fn(async () => undefined),
}));

vi.mock("./use-worked-model-net-projection", () => ({
  useWorkedModelNetProjection: () => workedModel,
}));

const input = {
  bundleKey: "inventory-purchasing",
  chatEndpoint: "/agents/chat",
  currentOrigin: "https://petrinaut.example",
  enabled: true,
  isBrunchConfigured: true,
  principalKey: "principal-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRemoteDocumentRepository", () => {
  test("exposes a storage-neutral record and typed process-agent seed", () => {
    const { result } = renderHook(() => useRemoteDocumentRepository(input));

    expect(result.current.repository.status).toEqual({ state: "ready" });
    expect(result.current.repository.current).toEqual(
      expect.objectContaining({
        documentId: "document-1",
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
      }),
    );
    expect(result.current.repository.current).not.toHaveProperty("copyId");
    expect(result.current.processAgentSeed).toEqual({
      documentId: "document-1",
      conversationId: "conversation-1",
    });
    expect(result.current.repository.actions).toEqual({
      createCleanNetProjection: workedModel.createCleanNetProjection,
    });
  });

  test("rejects a revision for a document the repository does not own", async () => {
    const { result } = renderHook(() => useRemoteDocumentRepository(input));

    await expect(
      result.current.repository.persistRevision({
        documentId: "local-document",
        incarnationId: "local-incarnation",
        definition: workedModel.netProjection.definition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      }),
    ).rejects.toThrow(
      "Worked-model repository does not own document local-document.",
    );
    expect(workedModel.persistDefinition).not.toHaveBeenCalled();
  });

  test("fails closed when the route has no configured endpoint", () => {
    const { result } = renderHook(() =>
      useRemoteDocumentRepository({
        ...input,
        isBrunchConfigured: false,
      }),
    );

    expect(result.current.repository.status).toMatchObject({
      state: "unavailable",
    });
    expect(
      result.current.repository.actions.createCleanNetProjection,
    ).toBeUndefined();
  });
});
