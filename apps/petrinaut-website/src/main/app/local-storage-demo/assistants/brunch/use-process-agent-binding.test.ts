/**
 * @vitest-environment jsdom
 */
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, Suspense } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  resolveProcessAgentBinding,
  useProcessAgentBinding,
} from "./use-process-agent-binding";

import type { DocumentRecord } from "../../documents/document-repository";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const document = (
  documentId: string,
  revisionId = `${documentId}-revision`,
): DocumentRecord => ({
  documentId,
  incarnationId: `${documentId}-incarnation`,
  revisionId,
  title: documentId,
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
});

describe("resolveProcessAgentBinding", () => {
  test("uses fixture configuration without adding it to the document", () => {
    expect(
      resolveProcessAgentBinding({
        document: document("fixture-document"),
        fixture: { conversationId: "fixture-conversation" },
      }),
    ).toMatchObject({
      conversationId: "fixture-conversation",
      documentId: "fixture-document",
    });
  });

  test("preserves binding identity across revision and container changes", () => {
    const initialDocument = document("stable-document", "first-revision");
    const { rerender, result } = renderHook(
      (input: {
        readonly document: DocumentRecord;
        readonly fixture: { readonly conversationId: string };
      }) =>
        useProcessAgentBinding({
          document: input.document,
          fixture: input.fixture,
        }),
      {
        initialProps: {
          document: initialDocument,
          fixture: { conversationId: "stable-conversation" },
        },
      },
    );
    const initialBinding = result.current;

    rerender({
      document: {
        ...initialDocument,
        revisionId: "second-revision",
        definition: structuredClone(initialDocument.definition),
      },
      fixture: { conversationId: "stable-conversation" },
    });

    expect(result.current).toBe(initialBinding);
  });

  test("creates one durable fallback per document after commit in StrictMode", async () => {
    const values = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) =>
      values.set(key, value),
    );
    vi.stubGlobal("localStorage", {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem,
    } satisfies Storage);

    const never = new Promise<void>(() => {});
    const Abandoned = () => {
      useProcessAgentBinding({
        document: document("abandoned-document"),
        fixture: undefined,
      });
      throw never;
    };
    render(
      createElement(
        StrictMode,
        null,
        createElement(Suspense, { fallback: null }, createElement(Abandoned)),
      ),
    );
    expect(setItem).not.toHaveBeenCalled();
    cleanup();

    const { result, rerender } = renderHook(
      ({ currentDocument }: { currentDocument: DocumentRecord }) =>
        useProcessAgentBinding({
          document: currentDocument,
          fixture: undefined,
        }),
      {
        initialProps: { currentDocument: document("document-a") },
        wrapper: ({ children }) => createElement(StrictMode, null, children),
      },
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    const documentABinding = result.current;
    expect(setItem).toHaveBeenCalledOnce();

    rerender({
      currentDocument: document("document-a", "replacement-revision"),
    });
    expect(result.current).toBe(documentABinding);
    expect(setItem).toHaveBeenCalledOnce();

    rerender({ currentDocument: document("document-b") });
    await waitFor(() => expect(result.current?.documentId).toBe("document-b"));
    expect(result.current?.conversationId).not.toBe(
      documentABinding?.conversationId,
    );
    expect(setItem).toHaveBeenCalledTimes(2);

    rerender({ currentDocument: document("document-a") });
    await waitFor(() =>
      expect(result.current?.conversationId).toBe(
        documentABinding?.conversationId,
      ),
    );
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});
