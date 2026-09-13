/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import { useDocumentController } from "./use-document-controller";

import type { DocumentRecord, DocumentRepository } from "./document-repository";

const record: DocumentRecord = {
  documentId: "local-document",
  incarnationId: "local-incarnation",
  revisionId: "local-revision",
  title: "Local",
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
  origin: { kind: "local" },
};
const create = vi.hoisted(() => vi.fn(() => record));
const open = vi.hoisted(() => vi.fn());
const createCleanCopy = vi.hoisted(() => vi.fn(async () => undefined));
const useLocal = vi.hoisted(() => vi.fn());
const useRemote = vi.hoisted(() => vi.fn());
const useOverlay = vi.hoisted(() => vi.fn());

const repository = (actions: DocumentRepository["actions"]) =>
  ({
    records: [record],
    current: record,
    status: { state: "ready" },
    open,
    actions,
    persistRevision: vi.fn(async () => undefined),
    settleRevision: vi.fn(async () => undefined),
  }) satisfies DocumentRepository;

vi.mock("./local-storage/use-local-document-repository", () => ({
  useLocalDocumentRepository: useLocal,
}));
vi.mock("./local-storage/use-fixture-document-overlay", () => ({
  useFixtureDocumentOverlay: useOverlay,
}));
vi.mock("./remote/use-remote-document-repository", () => ({
  useRemoteDocumentRepository: useRemote,
}));

beforeEach(() => {
  vi.clearAllMocks();
  const localRepository = repository({ create });
  useLocal.mockReturnValue({
    repository: localRepository,
    storedDocuments: {},
    updateStoredDocuments: vi.fn(),
  });
  useOverlay.mockReturnValue({
    repository: localRepository,
  });
  useRemote.mockReturnValue({
    repository: repository({ createCleanCopy }),
    processAgentSeed: {
      documentId: "remote-document",
      conversationId: "remote-conversation",
    },
  });
});

test("calls both adapters unconditionally and leaves the inactive adapter idle", () => {
  renderHook(() =>
    useDocumentController({
      bundleKey: "inventory-purchasing",
      chatEndpoint: "/agents/chat",
      currentOrigin: "https://petrinaut.example",
      isBrunchConfigured: true,
      principalKey: "principal",
      remoteRouteSelected: true,
      onOpenDocument: vi.fn(),
      onSelectLocalRoute: vi.fn(),
      fixture: {
        enabled: false,
        crewReservationSelected: false,
        rootArcTracerSelected: false,
        constructionSelected: false,
        rootCreationSelected: false,
      },
    }),
  );

  expect(useLocal).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false }),
  );
  expect(useRemote).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: true }),
  );
  expect(create).not.toHaveBeenCalled();
  expect(createCleanCopy).not.toHaveBeenCalled();
});

test("creates through the local repository before navigating and opening", () => {
  const onSelectLocalRoute = vi.fn();
  const { result } = renderHook(() =>
    useDocumentController({
      bundleKey: "inventory-purchasing",
      chatEndpoint: "/agents/chat",
      currentOrigin: "https://petrinaut.example",
      isBrunchConfigured: true,
      principalKey: "principal",
      remoteRouteSelected: true,
      onOpenDocument: vi.fn(),
      onSelectLocalRoute,
      fixture: {
        enabled: false,
        crewReservationSelected: false,
        rootArcTracerSelected: false,
        constructionSelected: false,
        rootCreationSelected: false,
      },
    }),
  );

  act(() => {
    result.current.controller.createLocalAndOpen({
      title: "Created locally",
      definition: record.definition,
    });
  });

  expect(create).toHaveBeenCalledWith({
    title: "Created locally",
    definition: record.definition,
  });
  expect(onSelectLocalRoute).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledWith("local-document");
});
