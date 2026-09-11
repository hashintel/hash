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
    .mockResolvedValueOnce(copy("b".repeat(64), firstDefinition))
    .mockResolvedValueOnce(copy("c".repeat(64), secondDefinition));
  const { result } = renderHook(() => useWorkedModelCopy(input));
  await waitFor(() => expect(result.current.copy).not.toBeNull());

  await act(async () => {
    await Promise.all([
      result.current.persistDefinition(firstDefinition),
      result.current.persistDefinition(secondDefinition),
    ]);
  });

  expect(updateWorkedModelDefinition).toHaveBeenNthCalledWith(1, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "a".repeat(64),
    definition: firstDefinition,
  });
  expect(updateWorkedModelDefinition).toHaveBeenNthCalledWith(2, {
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    principalKey: input.principalKey,
    copyId: "copy-1",
    expectedSha256: "b".repeat(64),
    definition: secondDefinition,
  });
  expect(result.current.copy?.definitionSha256).toBe("c".repeat(64));
});

test("creates a clean copy only after queued writes settle", async () => {
  vi.mocked(updateWorkedModelDefinition).mockResolvedValue(
    copy("b".repeat(64)),
  );
  vi.mocked(createCleanWorkedModelCopy).mockResolvedValue(
    copy("a".repeat(64), emptyDefinition, "copy-clean"),
  );
  const { result } = renderHook(() => useWorkedModelCopy(input));
  await waitFor(() => expect(result.current.copy).not.toBeNull());

  await act(async () => {
    await result.current.persistDefinition(emptyDefinition);
    await result.current.createCleanCopy();
  });

  expect(createCleanWorkedModelCopy).toHaveBeenCalledWith(requestInput);
  expect(result.current.copy?.copyId).toBe("copy-clean");
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
