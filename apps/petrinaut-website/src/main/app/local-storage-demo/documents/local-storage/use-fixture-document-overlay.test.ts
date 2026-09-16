/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { crewReservationDocumentId } from "../../prepared-crew-reservation-fixture";
import {
  legacyConstructionDocumentId,
  rootArcTracerDocumentId,
  rootCreationDocumentId,
  useFixtureDocumentOverlay,
} from "./use-fixture-document-overlay";

import type {
  DocumentRecord,
  DocumentRepository,
} from "../document-repository";
import type { LocalDocumentRepositoryAdapter } from "./use-local-document-repository";

const emptyDefinition = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const localRecord: DocumentRecord = {
  documentId: "local-document",
  incarnationId: "local-incarnation",
  revisionId: "local-revision",
  title: "Local",
  definition: emptyDefinition,
  origin: { kind: "local" },
};

const createLocalAdapter = (): {
  readonly adapter: LocalDocumentRepositoryAdapter;
  readonly persistRevision: ReturnType<typeof vi.fn>;
} => {
  const persistRevision = vi.fn(async () => undefined);
  const repository = {
    records: [localRecord],
    current: localRecord,
    status: { state: "ready" },
    open: vi.fn(),
    actions: {},
    persistRevision,
    settleRevision: vi.fn(async () => undefined),
  } satisfies DocumentRepository;
  return {
    adapter: {
      repository,
      storedDocuments: {
        [crewReservationDocumentId]: {
          id: crewReservationDocumentId,
          incarnationId: "fixture-incarnation",
          revisionId: "fixture-revision",
          title: "Prepared fixture",
          sdcpn: emptyDefinition,
          lastUpdated: new Date(0).toISOString(),
        },
      },
      updateStoredDocuments: vi.fn(),
    },
    persistRevision,
  };
};

const selectedFixture = {
  enabled: true,
  crewReservationSelected: true,
  rootArcTracerSelected: false,
  constructionSelected: false,
  rootCreationSelected: false,
};

beforeEach(() => {
  localStorage.clear();
});

test("passes non-fixture revisions through to the local repository", async () => {
  const { adapter, persistRevision } = createLocalAdapter();
  const { result } = renderHook(() =>
    useFixtureDocumentOverlay(adapter, selectedFixture),
  );
  const change = {
    documentId: localRecord.documentId,
    incarnationId: localRecord.incarnationId,
    definition: emptyDefinition,
    previousRevisionId: localRecord.revisionId,
    revisionId: "local-revision-2",
  };

  await result.current.repository.persistRevision(change);

  expect(persistRevision).toHaveBeenCalledWith(change);
});

test("rejects a fixture revision from another incarnation", async () => {
  const { adapter, persistRevision } = createLocalAdapter();
  const { result } = renderHook(() =>
    useFixtureDocumentOverlay(adapter, selectedFixture),
  );

  await expect(
    result.current.repository.persistRevision({
      documentId: crewReservationDocumentId,
      incarnationId: "stale-incarnation",
      definition: emptyDefinition,
      previousRevisionId: "fixture-revision",
      revisionId: "fixture-revision-2",
    }),
  ).rejects.toThrow("has a different incarnation");
  expect(persistRevision).not.toHaveBeenCalled();
});

test("keeps each generated tracer identity stable across mode changes", () => {
  const { adapter } = createLocalAdapter();
  const { result, rerender } = renderHook(
    (fixture: typeof selectedFixture) =>
      useFixtureDocumentOverlay(adapter, fixture),
    {
      initialProps: {
        ...selectedFixture,
        rootArcTracerSelected: true,
      },
    },
  );
  const rootArcRecord = result.current.repository.current;
  expect(rootArcRecord?.documentId).toBe(rootArcTracerDocumentId);
  expect(result.current.processAgentSeed?.documentId).toBe(
    rootArcTracerDocumentId,
  );

  rerender({
    ...selectedFixture,
    rootArcTracerSelected: true,
    constructionSelected: true,
  });
  expect(result.current.repository.current?.documentId).toBe(
    legacyConstructionDocumentId,
  );
  expect(result.current.processAgentSeed?.documentId).toBe(
    legacyConstructionDocumentId,
  );

  rerender({
    ...selectedFixture,
    rootArcTracerSelected: true,
    constructionSelected: true,
    rootCreationSelected: true,
  });
  expect(result.current.repository.current?.documentId).toBe(
    rootCreationDocumentId,
  );
  expect(result.current.processAgentSeed).toMatchObject({
    documentId: rootCreationDocumentId,
    fixture: { mode: "root-creation" },
  });

  rerender({
    ...selectedFixture,
    rootArcTracerSelected: true,
  });
  expect(result.current.repository.current).toMatchObject({
    documentId: rootArcTracerDocumentId,
    incarnationId: rootArcRecord?.incarnationId,
  });
});

test("rejects a known fixture identity that is not currently selected", async () => {
  const { adapter, persistRevision } = createLocalAdapter();
  const { result } = renderHook(() =>
    useFixtureDocumentOverlay(adapter, selectedFixture),
  );

  await expect(
    result.current.repository.persistRevision({
      documentId: rootArcTracerDocumentId,
      incarnationId: "other-incarnation",
      definition: emptyDefinition,
      previousRevisionId: "other-revision",
      revisionId: "other-revision-2",
    }),
  ).rejects.toThrow(
    `currently bound to ${crewReservationDocumentId}, not ${rootArcTracerDocumentId}`,
  );
  expect(persistRevision).not.toHaveBeenCalled();
});

test("settles only the selected fixture's persisted revision", async () => {
  const { adapter } = createLocalAdapter();
  const { result } = renderHook(() =>
    useFixtureDocumentOverlay(adapter, selectedFixture),
  );
  const current = result.current.repository.current;
  if (current === null) throw new Error("Expected the fixture document.");

  await result.current.repository.persistRevision({
    documentId: current.documentId,
    incarnationId: current.incarnationId,
    definition: current.definition,
    previousRevisionId: current.revisionId,
    revisionId: "persisted-revision",
  });
  await expect(
    result.current.repository.settleRevision({
      documentId: current.documentId,
      revisionId: "persisted-revision",
    }),
  ).resolves.toBeUndefined();
  await expect(
    result.current.repository.settleRevision({
      documentId: current.documentId,
      revisionId: "unpersisted-revision",
    }),
  ).rejects.toThrow("has not persisted revision");
});

test("exposes no fixture persistence metadata through its source", () => {
  const { adapter } = createLocalAdapter();
  const { result } = renderHook(() =>
    useFixtureDocumentOverlay(adapter, selectedFixture),
  );

  expect(Object.keys(result.current).toSorted()).toEqual([
    "processAgentSeed",
    "repository",
  ]);
  expect(result.current).not.toHaveProperty("runtime");
  expect(result.current).not.toHaveProperty("settledManifest");
  expect(result.current).not.toHaveProperty("persistCoherentSnapshot");
  expect(result.current.repository.current).not.toHaveProperty(
    "coherentSnapshots",
  );
  expect(result.current.repository.current).not.toHaveProperty(
    "rootArcRequestedBaseHash",
  );
});

test("rejects a stored record whose key and document identity disagree", () => {
  const { adapter } = createLocalAdapter();
  const mismatchedAdapter: LocalDocumentRepositoryAdapter = {
    ...adapter,
    storedDocuments: {
      ...adapter.storedDocuments,
      [crewReservationDocumentId]: {
        ...adapter.storedDocuments[crewReservationDocumentId]!,
        id: "another-document",
      },
    },
  };

  expect(() =>
    renderHook(() =>
      useFixtureDocumentOverlay(mismatchedAdapter, selectedFixture),
    ),
  ).toThrow(
    `Fixture storage key ${crewReservationDocumentId} contains document another-document.`,
  );
});
