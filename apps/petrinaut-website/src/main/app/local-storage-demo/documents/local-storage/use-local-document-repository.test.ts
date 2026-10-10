/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { useLocalDocumentRepository } from "./use-local-document-repository";

const documentId = toPetrinautId("document-1");
const olderId = toPetrinautId("older");
const newerId = toPetrinautId("newer");
const otherTabId = toPetrinautId("otherTab");
const emptyId = toPetrinautId("empty");
const retainedId = toPetrinautId("retained");

const emptyDefinition = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const stubStorage = (initial?: Record<string, unknown>) => {
  const entries = new Map<string, string>();
  if (initial !== undefined)
    entries.set("petrinaut-sdcpn", JSON.stringify(initial));
  const storage = {
    get length() {
      return entries.size;
    },
    clear: vi.fn(() => entries.clear()),
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    key: vi.fn((index: number) => [...entries.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => entries.delete(key)),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  } satisfies Storage;
  vi.stubGlobal("localStorage", storage);
  return storage;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const savedDocument = (id: string, lastUpdated: string) => ({
  id,
  title: id,
  lastUpdated,
  revisionId: `${id}-revision`,
  sdcpn: {
    ...emptyDefinition,
    places: [
      {
        id: `${id}-place`,
        name: "Place",
        x: 0,
        y: 0,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
      },
    ],
  },
});

describe("useLocalDocumentRepository", () => {
  test("persists an identity-explicit revision and rename", async () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId, onOpen: vi.fn() }),
    );

    await act(async () => {
      await result.current.repository.persistRevision({
        documentId: documentId,
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      });
    });
    act(() => {
      result.current.repository.actions.rename({
        documentId: documentId,
        title: "After",
      });
    });

    await waitFor(() => {
      expect(result.current.repository.current).toMatchObject({
        documentId: documentId,
        revisionId: "revision-2",
        title: "After",
      });
    });
  });

  test("creates a document without opening it", () => {
    const storage = stubStorage({
      [documentId]: {
        id: documentId,
        revisionId: "revision-1",
        title: "Existing",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId, onOpen }),
    );

    let createdId: string | undefined;
    act(() => {
      createdId = result.current.repository.actions.create({
        definition: emptyDefinition,
        title: "Created",
      }).documentId;
    });

    expect(createdId).toBeDefined();
    expect(
      JSON.parse(storage.getItem("petrinaut-sdcpn") ?? "{}"),
    ).toHaveProperty(createdId ?? "");
    expect(result.current.repository.current?.documentId).toBe(documentId);
    expect(onOpen).not.toHaveBeenCalled();
  });

  test("asks the host to open another document and keeps an empty one", () => {
    const storage = stubStorage({
      [emptyId]: {
        id: emptyId,
        revisionId: "empty-revision",
        title: "Empty",
        sdcpn: emptyDefinition,
        lastUpdated: "2026-01-02T00:00:00.000Z",
      },
      [retainedId]: savedDocument(retainedId, "2026-01-01T00:00:00.000Z"),
    });
    const onOpen = vi.fn();
    const { result, rerender } = renderHook(
      (props: { documentId: string }) =>
        useLocalDocumentRepository({ ...props, onOpen }),
      { initialProps: { documentId: emptyId } },
    );

    act(() => result.current.repository.open(retainedId));
    expect(onOpen).toHaveBeenCalledWith(retainedId);
    rerender({ documentId: retainedId });

    const stored = JSON.parse(
      storage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored[emptyId]).toBeDefined();
    expect(result.current.repository.current?.documentId).toBe(retainedId);
  });

  test("does not ask the host to reopen the open document", () => {
    stubStorage({
      [retainedId]: savedDocument(retainedId, "2026-01-01T00:00:00.000Z"),
    });
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId: retainedId, onOpen }),
    );

    act(() => result.current.repository.open(retainedId));

    expect(onOpen).not.toHaveBeenCalled();
  });

  test("rejects a revision that does not follow its predecessor", async () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId, onOpen: vi.fn() }),
    );

    await expect(
      result.current.repository.persistRevision({
        documentId: documentId,
        definition: emptyDefinition,
        previousRevisionId: "stale-revision",
        revisionId: "revision-2",
      }),
    ).rejects.toThrow("revision does not follow its predecessor");
  });

  test("refuses to overwrite a revision another tab stored before its storage event arrives", async () => {
    const stored = (revisionId: string, title: string) => ({
      [documentId]: {
        id: documentId,
        revisionId,
        title,
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const storage = stubStorage(stored("revision-1", "Mine"));
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId, onOpen: vi.fn() }),
    );
    await waitFor(() =>
      expect(result.current.repository.current?.revisionId).toBe("revision-1"),
    );
    // Another tab writes revision-2; this tab's `storage` event has not run.
    storage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify(stored("revision-2", "Other tab")),
    );

    await expect(
      result.current.repository.persistRevision({
        documentId: documentId,
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-3",
      }),
    ).rejects.toThrow("revision does not follow its predecessor");
    const saved: unknown = JSON.parse(
      storage.getItem("petrinaut-sdcpn") ?? "{}",
    );
    expect(saved).toMatchObject({
      [documentId]: { revisionId: "revision-2", title: "Other tab" },
    });
  });

  test("writes an accepted revision to storage before persistRevision resolves", () => {
    const storage = stubStorage({
      [documentId]: {
        id: documentId,
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ documentId, onOpen: vi.fn() }),
    );

    // Brunch reports a call's `after` revision as soon as the call returns,
    // so the write lands synchronously inside the change.
    act(() => {
      void result.current.repository.persistRevision({
        documentId,
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      });
      expect(
        JSON.parse(storage.getItem("petrinaut-sdcpn") ?? "{}"),
      ).toMatchObject({ [documentId]: { revisionId: "revision-2" } });
    });
  });
});

test("opens the document the host names", () => {
  stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
    [newerId]: savedDocument(newerId, "2026-01-02T00:00:00.000Z"),
  });
  const { result, rerender } = renderHook(
    (props: { documentId: string }) =>
      useLocalDocumentRepository({ ...props, onOpen: vi.fn() }),
    { initialProps: { documentId: olderId } },
  );
  expect(result.current.repository.current?.documentId).toBe(olderId);
  rerender({ documentId: newerId });
  expect(result.current.repository.current?.documentId).toBe(newerId);
});

test("has no open document when the host names one the browser does not hold", () => {
  const storage = stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
  });
  const before = storage.getItem("petrinaut-sdcpn");
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ documentId: newerId, onOpen: vi.fn() }),
  );
  expect(result.current.repository.status.state).toBe("ready");
  expect(result.current.repository.current).toBeNull();
  expect(storage.getItem("petrinaut-sdcpn")).toBe(before);
});

test("preserves another tab's document when renaming before its storage event arrives", () => {
  const storage = stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
  });
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ documentId: olderId, onOpen: vi.fn() }),
  );
  storage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
      [otherTabId]: savedDocument(otherTabId, "2026-01-02T00:00:00.000Z"),
    }),
  );
  act(() =>
    result.current.repository.actions.rename({
      documentId: olderId,
      title: "Renamed",
    }),
  );
  const saved: unknown = JSON.parse(storage.getItem("petrinaut-sdcpn") ?? "{}");
  expect(saved).toMatchObject({
    [olderId]: { title: "Renamed" },
    [otherTabId]: { id: otherTabId },
  });
});
