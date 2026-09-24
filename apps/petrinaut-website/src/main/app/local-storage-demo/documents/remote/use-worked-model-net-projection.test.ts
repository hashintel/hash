/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useWorkedModelNetProjection } from "./use-worked-model-net-projection";
import {
  createCleanNetProjection,
  resolveNetProjection,
  updateNetProjectionDefinition,
  type WorkedModelNetProjection,
} from "./worked-model-net-projection-client";

import type { SDCPN } from "@hashintel/petrinaut-core";

vi.mock("./worked-model-net-projection-client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("./worked-model-net-projection-client")
  >()),
  createCleanNetProjection: vi.fn(),
  resolveNetProjection: vi.fn(),
  updateNetProjectionDefinition: vi.fn(),
}));

const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const netProjection = (
  definitionSha256: string,
  definition = emptyDefinition,
  copyId = "copy-1",
  revisionId = "revision-1",
  documentId = `${copyId}-document`,
): WorkedModelNetProjection => ({
  bundleKey: "inventory-purchasing",
  copyId,
  conversationId: `${copyId}-conversation`,
  documentId,
  incarnationId: `${documentId}-incarnation`,
  fixtureVersion: "inventory-purchasing-v1",
  principalKey: "principal-a",
  title: "Inventory purchasing",
  definition,
  definitionSha256,
  revisionId,
});

const persistChange = (
  definition: SDCPN,
  previousRevisionId: string,
  revisionId: string,
  documentId = "copy-1-document",
) => ({
  documentId,
  incarnationId: `${documentId}-incarnation`,
  definition,
  previousRevisionId,
  revisionId,
});

const input = {
  bundleKey: "inventory-purchasing",
  chatEndpoint: "/agents/chat",
  currentOrigin: "https://petrinaut.example",
  enabled: true,
  principalKey: "principal-a",
};
const requestInput = {
  bundleKey: input.bundleKey,
  chatEndpoint: input.chatEndpoint,
  currentOrigin: input.currentOrigin,
  principalKey: input.principalKey,
};

beforeEach(() => {
  vi.mocked(resolveNetProjection).mockResolvedValue(
    netProjection("a".repeat(64)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("resolves the selected net projection", async () => {
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  expect(result.current.loading).toBe(true);
  await waitFor(() =>
    expect(result.current.netProjection?.documentId).toBe("copy-1-document"),
  );
  expect(resolveNetProjection).toHaveBeenCalledWith(requestInput);
  expect(result.current.error).toBeNull();
});

test("serializes definition writes against each returned hash", async () => {
  const firstDefinition: SDCPN = {
    ...emptyDefinition,
    places: [
      {
        id: "first",
        name: "First",
        x: 0,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      },
    ],
  };
  const secondDefinition: SDCPN = {
    ...firstDefinition,
    places: [
      ...firstDefinition.places,
      {
        id: "second",
        name: "Second",
        x: 0,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      },
    ],
  };
  vi.mocked(updateNetProjectionDefinition)
    .mockResolvedValueOnce(
      netProjection("b".repeat(64), firstDefinition, "copy-1", "revision-2"),
    )
    .mockResolvedValueOnce(
      netProjection("c".repeat(64), secondDefinition, "copy-1", "revision-3"),
    );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  await act(async () => {
    await Promise.all([
      result.current.persistDefinition(
        persistChange(firstDefinition, "revision-1", "revision-2"),
      ),
      result.current.persistDefinition(
        persistChange(secondDefinition, "revision-2", "revision-3"),
      ),
    ]);
  });

  expect(updateNetProjectionDefinition).toHaveBeenNthCalledWith(1, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "a".repeat(64),
    expectedRevisionId: "revision-1",
    definition: firstDefinition,
    revisionId: "revision-2",
  });
  expect(updateNetProjectionDefinition).toHaveBeenNthCalledWith(2, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "b".repeat(64),
    expectedRevisionId: "revision-2",
    definition: secondDefinition,
    revisionId: "revision-3",
  });
  expect(result.current.netProjection?.definitionSha256).toBe("c".repeat(64));
});

test("keys queued write bases by canonical document identity", async () => {
  vi.mocked(updateNetProjectionDefinition)
    .mockResolvedValueOnce(
      netProjection(
        "b".repeat(64),
        emptyDefinition,
        "copy-2",
        "revision-2",
        "document-1",
      ),
    )
    .mockResolvedValueOnce(
      netProjection(
        "c".repeat(64),
        emptyDefinition,
        "copy-2",
        "revision-3",
        "document-1",
      ),
    );
  vi.mocked(resolveNetProjection).mockResolvedValueOnce(
    netProjection(
      "a".repeat(64),
      emptyDefinition,
      "copy-1",
      "revision-1",
      "document-1",
    ),
  );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  await act(async () => {
    await result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2", "document-1"),
    );
    await result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-2", "revision-3", "document-1"),
    );
  });

  expect(updateNetProjectionDefinition).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      copyId: "copy-2",
      expectedSha256: "b".repeat(64),
    }),
  );
});

test("settles the persistence operation for an exact document revision", async () => {
  const pendingUpdate = Promise.withResolvers<WorkedModelNetProjection>();
  vi.mocked(updateNetProjectionDefinition).mockReturnValue(
    pendingUpdate.promise,
  );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  let settled = false;
  act(() => {
    void result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2"),
    );
    void result.current.settleDocumentRevision("revision-2").then(() => {
      settled = true;
    });
  });
  await act(async () => Promise.resolve());
  expect(settled).toBe(false);

  pendingUpdate.resolve(
    netProjection("b".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  await waitFor(() => expect(settled).toBe(true));
});

test("failed revision settlement clears its entry without masking the write failure", async () => {
  const pendingUpdate = Promise.withResolvers<WorkedModelNetProjection>();
  vi.mocked(updateNetProjectionDefinition).mockReturnValue(
    pendingUpdate.promise,
  );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  let write: Promise<void> | undefined;
  act(() => {
    write = result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2"),
    );
  });
  await waitFor(() => expect(updateNetProjectionDefinition).toHaveBeenCalled());
  const settlement = result.current.settleDocumentRevision("revision-2");
  const failure = new Error("The repository refused the write.");
  pendingUpdate.reject(failure);
  await expect(settlement).rejects.toBe(failure);
  await expect(write).rejects.toBe(failure);
  await expect(
    result.current.settleDocumentRevision("revision-2"),
  ).rejects.toThrow("has no persistence operation");
});

test("creates a clean net projection only after queued writes settle", async () => {
  vi.mocked(updateNetProjectionDefinition).mockResolvedValue(
    netProjection("b".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  vi.mocked(createCleanNetProjection).mockResolvedValue(
    netProjection("a".repeat(64), emptyDefinition, "copy-clean"),
  );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  await act(async () => {
    await result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2"),
    );
    await result.current.createCleanNetProjection();
  });

  expect(createCleanNetProjection).toHaveBeenCalledWith(requestInput);
  expect(result.current.netProjection?.documentId).toBe("copy-clean-document");
});

test("a delayed write cannot target or repopulate a newly selected copy", async () => {
  const pendingUpdate = Promise.withResolvers<WorkedModelNetProjection>();
  vi.mocked(resolveNetProjection)
    .mockResolvedValueOnce(
      netProjection("a".repeat(64), emptyDefinition, "copy-1"),
    )
    .mockResolvedValueOnce(
      netProjection("b".repeat(64), emptyDefinition, "copy-2"),
    );
  vi.mocked(updateNetProjectionDefinition).mockReturnValue(
    pendingUpdate.promise,
  );
  const { result, rerender } = renderHook(
    ({ bundleKey }: { bundleKey: string }) =>
      useWorkedModelNetProjection({ ...input, bundleKey }),
    { initialProps: { bundleKey: "inventory-purchasing" } },
  );
  await waitFor(() =>
    expect(result.current.netProjection?.documentId).toBe("copy-1-document"),
  );

  let write: Promise<void> | undefined;
  act(() => {
    write = result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2"),
    );
  });
  await waitFor(() => expect(updateNetProjectionDefinition).toHaveBeenCalled());
  rerender({ bundleKey: "another-bundle" });
  await waitFor(() =>
    expect(result.current.netProjection?.documentId).toBe("copy-2-document"),
  );

  pendingUpdate.resolve(
    netProjection("c".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  await act(async () => write);

  expect(updateNetProjectionDefinition).toHaveBeenCalledWith(
    expect.objectContaining({ copyId: "copy-1" }),
  );
  expect(result.current.netProjection?.documentId).toBe("copy-2-document");
});

test("refuses a write whose document or incarnation no longer matches", async () => {
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  await expect(
    result.current.persistDefinition({
      ...persistChange(emptyDefinition, "revision-1", "revision-2"),
      documentId: "other-document",
    }),
  ).rejects.toThrow("does not own document other-document");
  await expect(
    result.current.persistDefinition({
      ...persistChange(emptyDefinition, "revision-1", "revision-2"),
      incarnationId: "other-incarnation",
    }),
  ).rejects.toThrow("has a different incarnation");
  expect(updateNetProjectionDefinition).not.toHaveBeenCalled();
});

test("refuses a write captured against a previous clean-copy identity", async () => {
  vi.mocked(createCleanNetProjection).mockResolvedValue(
    netProjection("a".repeat(64), emptyDefinition, "copy-clean"),
  );
  const { result } = renderHook(() => useWorkedModelNetProjection(input));
  await waitFor(() => expect(result.current.netProjection).not.toBeNull());

  await act(async () => {
    await result.current.createCleanNetProjection();
  });

  await expect(
    result.current.persistDefinition(
      persistChange(emptyDefinition, "revision-1", "revision-2"),
    ),
  ).rejects.toThrow("does not own document copy-1-document");
  expect(updateNetProjectionDefinition).not.toHaveBeenCalled();
});

test("does not resolve a bundle while disabled", () => {
  const { result } = renderHook(() =>
    useWorkedModelNetProjection({ ...input, enabled: false }),
  );
  expect(result.current).toMatchObject({
    netProjection: null,
    error: null,
    loading: false,
  });
  expect(resolveNetProjection).not.toHaveBeenCalled();
});
