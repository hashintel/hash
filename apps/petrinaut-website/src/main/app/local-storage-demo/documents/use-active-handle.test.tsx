/** @vitest-environment jsdom */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";
import { initializePetrinautRust } from "@hashintel/petrinaut-core/rust";

import { useLocalDocumentRepository } from "./local-storage/use-local-document-repository";
import { useActiveHandle } from "./use-active-handle";

import type { InstanceEngine } from "../instance-engine";
import type { DocumentRecord, DocumentRepository } from "./document-repository";
import type { Petrinaut } from "@hashintel/petrinaut-core";

const factory = vi.hoisted(() => ({
  wait: undefined as Promise<void> | undefined,
  instances: [] as Petrinaut[],
  create: vi.fn(),
}));
vi.mock("@hashintel/petrinaut-core/rust", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut-core/rust")>();
  return {
    ...actual,
    createRustPetrinaut: factory.create.mockImplementation(
      async (...args: Parameters<typeof actual.createRustPetrinaut>) => {
        await factory.wait;
        const instance = await actual.createRustPetrinaut(...args);
        vi.spyOn(instance, "dispose");
        factory.instances.push(instance);
        return instance;
      },
    ),
  };
});

const placeId = toPetrinautId("p");
const document: DocumentRecord = {
  documentId: toPetrinautId("engine-test"),
  revisionId: "initial",
  title: "Shared net",
  definition: {
    places: [
      {
        id: placeId,
        name: "Queue",
        x: 0,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      },
    ],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
};
const makeRepository = (): DocumentRepository => ({
  current: document,
  records: [document],
  status: { state: "ready" },
  open: vi.fn(),
  actions: { create: vi.fn(), rename: vi.fn() },
  persistRevision: vi.fn(async () => {}),
});
const renderEngine = (
  repository = makeRepository(),
  engine: InstanceEngine = "rust",
) =>
  renderHook(({ selected, repo }) => useActiveHandle(repo, selected), {
    initialProps: { selected: engine, repo: repository },
    wrapper: StrictMode,
  });

beforeAll(async () => {
  await initializePetrinautRust(
    await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../../../../libs/@hashintel/petrinaut-core/rust/pkg/petrinaut_core_bg.wasm",
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  factory.wait = undefined;
  factory.instances.length = 0;
  vi.unstubAllGlobals();
});

test("both engines edit and reopen the same stored net, with Rust mutations and undo", async () => {
  const entries = new Map([
    [
      "petrinaut-sdcpn",
      JSON.stringify({
        [document.documentId]: {
          id: document.documentId,
          revisionId: document.revisionId,
          title: document.title,
          sdcpn: document.definition,
          lastUpdated: "2026-01-01T00:00:00.000Z",
        },
      }),
    ],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
  const useStoredEngine = ({ engine }: { engine: InstanceEngine }) => {
    const { repository } = useLocalDocumentRepository({
      documentId: document.documentId,
      onOpen: () => {},
    });
    return useActiveHandle(repository, engine);
  };
  const { result, rerender, unmount } = renderHook(useStoredEngine, {
    initialProps: { engine: "rust" },
    wrapper: StrictMode,
  });
  await waitFor(() =>
    expect({
      engine: result.current.activeHandle?.engine,
      error: result.current.loadError,
    }).toEqual({ engine: "rust", error: null }),
  );
  const rust = result.current.activeHandle!.instance;
  const change = vi.spyOn(rust.handle, "change");
  await act(async () =>
    rust.mutations.updatePlacePosition({ placeId, position: { x: 42, y: 7 } }),
  );
  expect(change).not.toHaveBeenCalled();
  await act(async () => {
    rust.handle.history?.undo();
  });
  expect(rust.handle.doc()?.places[0]?.x).toBe(0);
  await act(async () => {
    rust.handle.history?.redo();
  });
  expect(rust.handle.doc()?.places[0]?.x).toBe(42);
  const snapshot = rust.handle.doc();
  rerender({ engine: "typescript" });
  await waitFor(() =>
    expect(result.current.activeHandle?.engine).toBe("typescript"),
  );
  expect(result.current.activeHandle?.handle.doc()).toEqual(snapshot);
  expect(rust.dispose).toHaveBeenCalledOnce();
  await act(async () =>
    result.current.activeHandle?.instance.mutations.updatePlacePosition({
      placeId,
      position: { x: 99, y: 8 },
    }),
  );
  rerender({ engine: "rust" });
  await waitFor(() => expect(result.current.activeHandle?.engine).toBe("rust"));
  expect(result.current.activeHandle?.handle.doc()?.places[0]?.x).toBe(99);
  expect(result.current.activeHandle?.handle.history?.canUndo.get()).toBe(
    false,
  );
  unmount();
  const reopened = renderHook(useStoredEngine, {
    initialProps: { engine: "rust" },
  });
  await waitFor(() =>
    expect(
      reopened.result.current.activeHandle?.handle.doc()?.places[0]?.x,
    ).toBe(99),
  );
  expect([...entries.keys()]).toEqual(["petrinaut-sdcpn"]);
});

test("rapid engine changes wait for an outstanding save and preserve its revision", async () => {
  const pending = Promise.withResolvers<void>();
  const repo = makeRepository();
  const persist = vi.fn<DocumentRepository["persistRevision"]>(
    () => pending.promise,
  );
  const repository = { ...repo, persistRevision: persist };
  const { result, rerender } = renderEngine(repository, "typescript");
  await waitFor(() => expect(result.current.activeHandle).not.toBeNull());
  act(() =>
    result.current.activeHandle?.instance.mutations.updatePlacePosition({
      placeId,
      position: { x: 42, y: 7 },
    }),
  );
  rerender({ selected: "rust", repo: repository });
  rerender({ selected: "typescript", repo: repository });
  expect(result.current.activeHandle).toBeNull();
  await act(async () => pending.resolve());
  await waitFor(() =>
    expect(result.current.activeHandle?.engine).toBe("typescript"),
  );
  expect(result.current.activeHandle?.handle.doc()?.places[0]?.x).toBe(42);
  await act(async () =>
    result.current.activeHandle?.instance.mutations.updatePlacePosition({
      placeId,
      position: { x: 43, y: 7 },
    }),
  );
  expect(persist.mock.calls[1]?.[0].previousRevisionId).toBe(
    persist.mock.calls[0]?.[0].revisionId,
  );
});

test("a refused save during a switch reloads the stored revision and reports the loss", async () => {
  const pending = Promise.withResolvers<void>();
  const repository = {
    ...makeRepository(),
    persistRevision: vi.fn(() => pending.promise),
  };
  const { result, rerender } = renderEngine(repository, "typescript");
  await waitFor(() => expect(result.current.activeHandle).not.toBeNull());
  act(() =>
    result.current.activeHandle?.instance.mutations.updatePlacePosition({
      placeId,
      position: { x: 42, y: 7 },
    }),
  );
  rerender({ selected: "rust", repo: repository });
  await act(async () => pending.reject(new Error("Save refused")));
  await waitFor(() => expect(result.current.activeHandle?.engine).toBe("rust"));
  expect(result.current.activeHandle?.handle.doc()?.places[0]?.x).toBe(0);
  expect(result.current.unsavedChangeMessage).toBe("Save refused");
});

test("a newer repository revision supersedes a pending Rust load", async () => {
  const pending = Promise.withResolvers<void>();
  factory.wait = pending.promise;
  const { result, rerender } = renderEngine();
  const updated = {
    ...document,
    revisionId: "external",
    definition: {
      ...document.definition,
      places: [
        {
          id: placeId,
          name: "External",
          x: 17,
          y: 0,
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
        },
      ],
    },
  };
  rerender({
    selected: "rust",
    repo: { ...makeRepository(), current: updated, records: [updated] },
  });
  await act(async () => pending.resolve());
  await waitFor(() =>
    expect(result.current.activeHandle?.handle.doc()?.places[0]?.name).toBe(
      "External",
    ),
  );
  for (const instance of factory.instances) {
    if (instance !== result.current.activeHandle?.instance)
      expect(instance.dispose).toHaveBeenCalledOnce();
  }
});

test("a failed Rust load exposes an error and can be retried", async () => {
  const pending = Promise.withResolvers<void>();
  factory.wait = pending.promise;
  const { result } = renderEngine();
  await act(async () => pending.reject(new Error("Wasm unavailable")));
  await waitFor(() =>
    expect(result.current.loadError).toBe("Wasm unavailable"),
  );
  expect(result.current.activeHandle).toBeNull();
  factory.wait = undefined;
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.activeHandle?.engine).toBe("rust"));
  expect(result.current.loadError).toBeNull();
});

test("unmounting during Rust initialization disposes every completed instance", async () => {
  const pending = Promise.withResolvers<void>();
  factory.wait = pending.promise;
  const { unmount } = renderEngine();
  await act(async () => {});
  unmount();
  await act(async () => pending.resolve());
  await waitFor(() => expect(factory.instances.length).toBeGreaterThan(0));
  for (const instance of factory.instances)
    expect(instance.dispose).toHaveBeenCalledOnce();
});
