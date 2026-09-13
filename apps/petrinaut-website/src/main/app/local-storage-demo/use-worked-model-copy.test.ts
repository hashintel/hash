/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useWorkedModelCopy } from "./use-worked-model-copy";
import {
  createCleanWorkedModelCopy,
  resolveWorkedModelCopy,
  updateWorkedModelDefinition,
  type WorkedModelCopy,
} from "./worked-model-client";

import type { SDCPN } from "@hashintel/petrinaut-core";

vi.mock("./worked-model-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./worked-model-client")>()),
  createCleanWorkedModelCopy: vi.fn(),
  resolveWorkedModelCopy: vi.fn(),
  updateWorkedModelDefinition: vi.fn(),
}));

const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const copy = (
  definitionSha256: string,
  definition = emptyDefinition,
  copyId = "copy-1",
  revisionId = "revision-1",
): WorkedModelCopy => ({
  bundleKey: "inventory-purchasing",
  copyId,
  conversationId: `${copyId}-conversation`,
  documentId: `${copyId}-document`,
  incarnationId: `${copyId}-incarnation`,
  fixtureVersion: "inventory-purchasing-v1",
  principalKey: "principal-a",
  title: "Inventory purchasing",
  definition,
  definitionSha256,
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
  vi.mocked(resolveWorkedModelCopy).mockResolvedValue(copy("a".repeat(64)));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("resolves the selected bundle copy", async () => {
  const { result } = renderHook(() => useWorkedModelCopy(input));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.copy?.copyId).toBe("copy-1"));
  expect(resolveWorkedModelCopy).toHaveBeenCalledWith(requestInput);
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
  vi.mocked(updateWorkedModelDefinition)
    .mockResolvedValueOnce(
      copy("b".repeat(64), firstDefinition, "copy-1", "revision-2"),
    )
    .mockResolvedValueOnce(
      copy("c".repeat(64), secondDefinition, "copy-1", "revision-3"),
    );
  const { result } = renderHook(() => useWorkedModelCopy(input));
  await waitFor(() => expect(result.current.copy).not.toBeNull());

  await act(async () => {
    await Promise.all([
      result.current.persistDefinition({
        definition: firstDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      }),
      result.current.persistDefinition({
        definition: secondDefinition,
        previousRevisionId: "revision-2",
        revisionId: "revision-3",
      }),
    ]);
  });

  expect(updateWorkedModelDefinition).toHaveBeenNthCalledWith(1, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "a".repeat(64),
    expectedRevisionId: "revision-1",
    definition: firstDefinition,
    revisionId: "revision-2",
  });
  expect(updateWorkedModelDefinition).toHaveBeenNthCalledWith(2, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "b".repeat(64),
    expectedRevisionId: "revision-2",
    definition: secondDefinition,
    revisionId: "revision-3",
  });
  expect(result.current.copy?.definitionSha256).toBe("c".repeat(64));
});

test("settles the persistence operation for an exact document revision", async () => {
  const pendingUpdate = Promise.withResolvers<WorkedModelCopy>();
  vi.mocked(updateWorkedModelDefinition).mockReturnValue(pendingUpdate.promise);
  const { result } = renderHook(() => useWorkedModelCopy(input));
  await waitFor(() => expect(result.current.copy).not.toBeNull());

  let settled = false;
  act(() => {
    void result.current.persistDefinition({
      definition: emptyDefinition,
      previousRevisionId: "revision-1",
      revisionId: "revision-2",
    });
    void result.current.settleDocumentRevision("revision-2").then(() => {
      settled = true;
    });
  });
  await act(async () => Promise.resolve());
  expect(settled).toBe(false);

  pendingUpdate.resolve(
    copy("b".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  await waitFor(() => expect(settled).toBe(true));
});

test("creates a clean copy only after queued writes settle", async () => {
  vi.mocked(updateWorkedModelDefinition).mockResolvedValue(
    copy("b".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  vi.mocked(createCleanWorkedModelCopy).mockResolvedValue(
    copy("a".repeat(64), emptyDefinition, "copy-clean"),
  );
  const { result } = renderHook(() => useWorkedModelCopy(input));
  await waitFor(() => expect(result.current.copy).not.toBeNull());

  await act(async () => {
    await result.current.persistDefinition({
      definition: emptyDefinition,
      previousRevisionId: "revision-1",
      revisionId: "revision-2",
    });
    await result.current.createCleanCopy();
  });

  expect(createCleanWorkedModelCopy).toHaveBeenCalledWith(requestInput);
  expect(result.current.copy?.copyId).toBe("copy-clean");
});

test("a delayed write cannot target or repopulate a newly selected copy", async () => {
  const pendingUpdate = Promise.withResolvers<WorkedModelCopy>();
  vi.mocked(resolveWorkedModelCopy)
    .mockResolvedValueOnce(copy("a".repeat(64), emptyDefinition, "copy-1"))
    .mockResolvedValueOnce(copy("b".repeat(64), emptyDefinition, "copy-2"));
  vi.mocked(updateWorkedModelDefinition).mockReturnValue(pendingUpdate.promise);
  const { result, rerender } = renderHook(
    ({ bundleKey }: { bundleKey: string }) =>
      useWorkedModelCopy({ ...input, bundleKey }),
    { initialProps: { bundleKey: "inventory-purchasing" } },
  );
  await waitFor(() => expect(result.current.copy?.copyId).toBe("copy-1"));

  let write: Promise<void> | undefined;
  act(() => {
    write = result.current.persistDefinition({
      definition: emptyDefinition,
      previousRevisionId: "revision-1",
      revisionId: "revision-2",
    });
  });
  await waitFor(() => expect(updateWorkedModelDefinition).toHaveBeenCalled());
  rerender({ bundleKey: "another-bundle" });
  await waitFor(() => expect(result.current.copy?.copyId).toBe("copy-2"));

  pendingUpdate.resolve(
    copy("c".repeat(64), emptyDefinition, "copy-1", "revision-2"),
  );
  await act(async () => write);

  expect(updateWorkedModelDefinition).toHaveBeenCalledWith(
    expect.objectContaining({ copyId: "copy-1" }),
  );
  expect(result.current.copy?.copyId).toBe("copy-2");
});

test("does not resolve a bundle while disabled", () => {
  const { result } = renderHook(() =>
    useWorkedModelCopy({ ...input, enabled: false }),
  );
  expect(result.current).toMatchObject({
    copy: null,
    error: null,
    loading: false,
  });
  expect(resolveWorkedModelCopy).not.toHaveBeenCalled();
});
