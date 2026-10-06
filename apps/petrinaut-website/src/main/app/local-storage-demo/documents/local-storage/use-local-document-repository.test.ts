/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { isPetrinautId, toPetrinautId } from "@hashintel/petrinaut-core";

import { startEmptyNetInStorage } from "../../use-local-storage-sdcpns";
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

describe("useLocalDocumentRepository", () => {
  test("persists an identity-explicit revision and rename", async () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
    );

    await act(async () => {
      await result.current.repository.persistRevision({
        documentId: documentId,
        incarnationId: "incarnation-1",
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

  test("rejects a revision from another incarnation", async () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
    );

    await expect(
      result.current.repository.persistRevision({
        documentId: documentId,
        incarnationId: "stale-incarnation",
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      }),
    ).rejects.toThrow("has a different incarnation");
  });

  test("creates and opens local documents through the repository", () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
        title: "Existing",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const onOpen = vi.fn();
    const { result } = renderHook(() => useLocalDocumentRepository({ onOpen }));

    let createdId: string | undefined;
    act(() => {
      const created = result.current.repository.actions.create({
        definition: emptyDefinition,
        title: "Created",
      });
      createdId = created.documentId;
    });

    expect(createdId).toBeDefined();
    expect(result.current.repository.current?.documentId).toBe(createdId);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  test("removes an empty current document when another document opens", () => {
    const storage = stubStorage({
      [emptyId]: {
        id: emptyId,
        incarnationId: "empty-incarnation",
        revisionId: "empty-revision",
        title: "Empty",
        sdcpn: emptyDefinition,
        lastUpdated: "2026-01-02T00:00:00.000Z",
      },
      [retainedId]: {
        id: retainedId,
        incarnationId: "retained-incarnation",
        revisionId: "retained-revision",
        title: "Retained",
        sdcpn: {
          ...emptyDefinition,
          places: [
            {
              id: "place-1",
              name: "Place",
              x: 0,
              y: 0,
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
            },
          ],
        },
        lastUpdated: "2026-01-01T00:00:00.000Z",
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
    );

    act(() => result.current.repository.open(retainedId));

    const stored = JSON.parse(
      storage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored[emptyId]).toBeUndefined();
    expect(stored[retainedId]).toBeDefined();
    expect(result.current.repository.current?.documentId).toBe(retainedId);
  });

  test("rejects a revision that does not follow its predecessor", async () => {
    stubStorage({
      [documentId]: {
        id: documentId,
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
    );

    await expect(
      result.current.repository.persistRevision({
        documentId: documentId,
        incarnationId: "incarnation-1",
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
        incarnationId: "incarnation-1",
        revisionId,
        title,
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const storage = stubStorage(stored("revision-1", "Mine"));
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
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
        incarnationId: "incarnation-1",
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
        incarnationId: "incarnation-1",
        revisionId: "revision-1",
        title: "Before",
        sdcpn: emptyDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    });
    const { result } = renderHook(() =>
      useLocalDocumentRepository({ onOpen: vi.fn() }),
    );

    // Brunch reports a call's `after` revision as soon as the call returns,
    // so the write lands synchronously inside the change.
    act(() => {
      void result.current.repository.persistRevision({
        documentId,
        incarnationId: "incarnation-1",
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

const savedDocument = (id: string, lastUpdated: string) => ({
  id,
  title: id,
  lastUpdated,
  incarnationId: `${id}-incarnation`,
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

test("selects the newest stored document and retains an explicit selection", () => {
  stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
    [newerId]: savedDocument(newerId, "2026-01-02T00:00:00.000Z"),
  });
  const { result, rerender } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  expect(result.current.repository.current?.documentId).toBe(newerId);
  act(() => result.current.repository.open(olderId));
  rerender();
  expect(result.current.repository.current?.documentId).toBe(olderId);
});

test("opens a default document under a fresh net id when nothing is stored", () => {
  stubStorage();
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  expect(isPetrinautId(result.current.repository.current?.documentId)).toBe(
    true,
  );
});

test("opens the empty document created by the new route", () => {
  const storage = stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
  });
  const created = startEmptyNetInStorage(storage);
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  expect(result.current.repository.current?.documentId).toBe(created.id);
});

test("preserves another tab's document when renaming before its storage event arrives", () => {
  const storage = stubStorage({
    [olderId]: savedDocument(olderId, "2026-01-01T00:00:00.000Z"),
  });
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
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
