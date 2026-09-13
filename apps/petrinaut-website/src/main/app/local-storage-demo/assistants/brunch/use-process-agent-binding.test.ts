/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  resolveProcessAgentBinding,
  useProcessAgentBinding,
} from "./use-process-agent-binding";

import type { DocumentRecord } from "../../documents/document-repository";

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
  origin: { kind: "local" },
});

describe("resolveProcessAgentBinding", () => {
  test("binds a remote seed to the canonical document identity", () => {
    expect(
      resolveProcessAgentBinding({
        document: document("remote-document"),
        seed: {
          documentId: "remote-document",
          conversationId: "remote-conversation",
        },
        fixture: undefined,
      }),
    ).toEqual({
      conversationId: "remote-conversation",
      documentId: "remote-document",
      incarnationId: "remote-document-incarnation",
    });
  });

  test("fails when a seed belongs to another document", () => {
    expect(() =>
      resolveProcessAgentBinding({
        document: document("current-document"),
        seed: {
          documentId: "stale-document",
          conversationId: "stale-conversation",
        },
        fixture: undefined,
      }),
    ).toThrow(
      "Process-agent seed belongs to stale-document, not current-document.",
    );
  });

  test("uses fixture configuration without adding it to the document", () => {
    expect(
      resolveProcessAgentBinding({
        document: document("fixture-document"),
        seed: undefined,
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
        readonly seed: {
          readonly documentId: string;
          readonly conversationId: string;
        };
      }) =>
        useProcessAgentBinding({
          document: input.document,
          seed: input.seed,
          fixture: undefined,
        }),
      {
        initialProps: {
          document: initialDocument,
          seed: {
            documentId: initialDocument.documentId,
            conversationId: "stable-conversation",
          },
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
      seed: {
        documentId: initialDocument.documentId,
        conversationId: "stable-conversation",
      },
    });

    expect(result.current).toBe(initialBinding);
  });
});
