/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { startEmptyNetInStorage } from "../../use-local-storage-sdcpns";
import { useLocalDocumentRepository } from "./use-local-document-repository";

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
      "document-1": {
        id: "document-1",
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
        documentId: "document-1",
        incarnationId: "incarnation-1",
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      });
    });
    act(() => {
      result.current.repository.actions.rename({
        documentId: "document-1",
        title: "After",
      });
    });

    await waitFor(() => {
      expect(result.current.repository.current).toMatchObject({
        documentId: "document-1",
        revisionId: "revision-2",
        title: "After",
      });
    });
  });

  test("rejects a revision from another incarnation", async () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
        documentId: "document-1",
        incarnationId: "stale-incarnation",
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      }),
    ).rejects.toThrow("has a different incarnation");
  });

  test("creates and opens local documents through the repository", () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
      empty: {
        id: "empty",
        incarnationId: "empty-incarnation",
        revisionId: "empty-revision",
        title: "Empty",
        sdcpn: emptyDefinition,
        lastUpdated: "2026-01-02T00:00:00.000Z",
      },
      retained: {
        id: "retained",
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

    act(() => result.current.repository.open("retained"));

    const stored = JSON.parse(
      storage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    expect(stored.empty).toBeUndefined();
    expect(stored.retained).toBeDefined();
    expect(result.current.repository.current?.documentId).toBe("retained");
  });

  test("rejects a revision that does not follow its predecessor", async () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
        documentId: "document-1",
        incarnationId: "incarnation-1",
        definition: emptyDefinition,
        previousRevisionId: "stale-revision",
        revisionId: "revision-2",
      }),
    ).rejects.toThrow("revision does not follow its predecessor");
  });

  test("refuses to overwrite a revision another tab stored before its storage event arrives", async () => {
    const stored = (revisionId: string, title: string) => ({
      "document-1": {
        id: "document-1",
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
        documentId: "document-1",
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
      "document-1": { revisionId: "revision-2", title: "Other tab" },
    });
  });

  test("settles an available local revision immediately", async () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
      result.current.repository.settleRevision({
        documentId: "document-1",
        revisionId: "revision-1",
      }),
    ).resolves.toBeUndefined();
  });

  test("rejects settlement of a revision that has not been persisted", async () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
      result.current.repository.settleRevision({
        documentId: "document-1",
        revisionId: "unpersisted-revision",
      }),
    ).rejects.toThrow("has not persisted revision");
  });

  test("settles only the revision that persistRevision just recorded", async () => {
    stubStorage({
      "document-1": {
        id: "document-1",
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
        documentId: "document-1",
        incarnationId: "incarnation-1",
        definition: emptyDefinition,
        previousRevisionId: "revision-1",
        revisionId: "revision-2",
      });
    });

    await expect(
      result.current.repository.settleRevision({
        documentId: "document-1",
        revisionId: "revision-1",
      }),
    ).rejects.toThrow("has not persisted revision");
    await expect(
      result.current.repository.settleRevision({
        documentId: "document-1",
        revisionId: "revision-2",
      }),
    ).resolves.toBeUndefined();
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
    older: savedDocument("older", "2026-01-01T00:00:00.000Z"),
    newer: savedDocument("newer", "2026-01-02T00:00:00.000Z"),
  });
  const { result, rerender } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  expect(result.current.repository.current?.documentId).toBe("newer");
  act(() => result.current.repository.open("older"));
  rerender();
  expect(result.current.repository.current?.documentId).toBe("older");
});

test("opens the empty document created by the new route", () => {
  const storage = stubStorage({
    older: savedDocument("older", "2026-01-01T00:00:00.000Z"),
  });
  const created = startEmptyNetInStorage(storage);
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  expect(result.current.repository.current?.documentId).toBe(created.id);
});

test("preserves another tab's document when renaming before its storage event arrives", () => {
  const storage = stubStorage({
    older: savedDocument("older", "2026-01-01T00:00:00.000Z"),
  });
  const { result } = renderHook(() =>
    useLocalDocumentRepository({ onOpen: vi.fn() }),
  );
  storage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      older: savedDocument("older", "2026-01-01T00:00:00.000Z"),
      otherTab: savedDocument("otherTab", "2026-01-02T00:00:00.000Z"),
    }),
  );
  act(() =>
    result.current.repository.actions.rename({
      documentId: "older",
      title: "Renamed",
    }),
  );
  const saved: unknown = JSON.parse(storage.getItem("petrinaut-sdcpn") ?? "{}");
  expect(saved).toMatchObject({
    older: { title: "Renamed" },
    otherTab: { id: "otherTab" },
  });
});
