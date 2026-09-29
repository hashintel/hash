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
};
const create = vi.hoisted(() => vi.fn(() => record));
const open = vi.hoisted(() => vi.fn());
const useLocal = vi.hoisted(() => vi.fn());

vi.mock("./local-storage/use-local-document-repository", () => ({
  useLocalDocumentRepository: useLocal,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useLocal.mockReturnValue({
    repository: {
      records: [record],
      current: record,
      status: { state: "ready" },
      open,
      actions: { create, rename: vi.fn() },
      persistRevision: vi.fn(async () => undefined),
      settleRevision: vi.fn(async () => undefined),
    } satisfies DocumentRepository,
    storedDocuments: {},
    updateStoredDocuments: vi.fn(),
  });
});

test("creates through the local repository before opening", () => {
  const { result } = renderHook(() =>
    useDocumentController({ onOpenDocument: vi.fn() }),
  );

  act(() => {
    result.current.controller.createAndOpen({
      title: "Created locally",
      definition: record.definition,
    });
  });

  expect(create).toHaveBeenCalledWith({
    title: "Created locally",
    definition: record.definition,
  });
  expect(open).toHaveBeenCalledWith("local-document");
});
