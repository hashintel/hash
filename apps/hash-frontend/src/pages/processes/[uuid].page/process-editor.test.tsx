// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ProcessEditor } from "./process-editor";

import type {
  EditorToHostMessage,
  HostToEditorMessage,
} from "./process-editor/shared/messages";
import type { PetriNetRevision } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import type { EntityId } from "@blockprotocol/type-system";

const fixture = vi.hoisted(() => {
  const definition = {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  };
  const entityUuid = "00000000-0000-4000-8000-000000000002";
  const entityId =
    `00000000-0000-4000-8000-000000000001~${entityUuid}` as EntityId;
  const firstRevision = {
    decisionTime: "2026-10-24T00:00:00.000Z",
    title: "Net",
    definition,
  };
  const savedRevision = {
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net (edited)",
    definition,
  };
  return {
    definition,
    entityUuid,
    entityId,
    firstRevision,
    savedRevision,
    /** The history the graph holds before and after the save. */
    historyBeforeSave: [firstRevision] as PetriNetRevision[],
    historyAfterSave: [savedRevision, firstRevision] as PetriNetRevision[],
    persistedNets: [
      {
        entityId,
        title: "Net",
        definition,
        userEditable: true,
        lastUpdated: firstRevision.decisionTime,
      },
    ],
    router: {
      push: () => Promise.resolve(true),
      replace: () => Promise.resolve(true),
    },
    loadPersistedNet: () => {},
    setUserEditable: () => {},
  };
});

vi.mock("next/router", () => ({ useRouter: () => fixture.router }));

vi.mock("next/dynamic", () => ({ default: () => () => null }));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

vi.mock("@hashintel/design-system", () => ({ AlertModal: () => null }));

vi.mock("@hashintel/petrinaut", () => ({}));

/** Answers from the graph's history: the post-save list once refetched. */
vi.mock(
  "./process-editor/use-process-save-and-load/use-petri-net-revisions",
  () => ({
    usePetriNetRevisions: () => {
      const [revisions, setRevisions] = useState(fixture.historyBeforeSave);
      const refetch = useCallback(() => {
        setRevisions(fixture.historyAfterSave);
        return Promise.resolve();
      }, []);
      return { revisions, refetch };
    },
  }),
);

/** Persists by refetching the history, as the real save does. */
vi.mock("./process-editor/use-process-save-and-load", () => ({
  useProcessSaveAndLoad: ({
    refetchRevisions,
  }: {
    refetchRevisions: () => Promise<unknown>;
  }) => ({
    loadPersistedNet: fixture.loadPersistedNet,
    persistedNets: fixture.persistedNets,
    persistedNetsLoading: false,
    persistDefinition: async () => {
      await refetchRevisions();
      return {
        entityId: fixture.entityId,
        decisionTime: fixture.savedRevision.decisionTime,
        userEditable: true,
      };
    },
    setUserEditable: fixture.setUserEditable,
    userEditable: true,
  }),
}));

/** What the host sent the editor, in order. */
const sent: HostToEditorMessage[] = [];

/** Posts to this window as the in-page editor does. */
const sendToHost = (message: EditorToHostMessage) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data: message, source: window }),
    );
  });

beforeEach(() => {
  sent.length = 0;
  vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
    sent.push(message as HostToEditorMessage);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const summaries = (revisions: PetriNetRevision[]) =>
  revisions.map(({ decisionTime, title }) => ({ decisionTime, title }));

test("a save sends the editor the revision list refetched after it", async () => {
  render(
    <ProcessEditor view={{ kind: "saved", entityUuid: fixture.entityUuid }} />,
  );
  sendToHost({ kind: "ready" });

  await waitFor(() =>
    expect(sent).toContainEqual(
      expect.objectContaining({
        kind: "init",
        revisions: summaries(fixture.historyBeforeSave),
      }),
    ),
  );

  const sentBeforeSave = sent.length;
  sendToHost({
    kind: "requestSave",
    requestId: "save-1",
    definition: fixture.definition,
    title: "Net (edited)",
  });

  await waitFor(() =>
    expect(sent.slice(sentBeforeSave)).toContainEqual(
      expect.objectContaining({
        kind: "saveResult",
        requestId: "save-1",
        result: expect.objectContaining({ ok: true }),
      }),
    ),
  );
  expect(sent.slice(sentBeforeSave)).toContainEqual({
    kind: "revisionsList",
    revisions: summaries(fixture.historyAfterSave),
  });
  const saveResult = sent.find(
    (
      message,
    ): message is Extract<HostToEditorMessage, { kind: "saveResult" }> =>
      message.kind === "saveResult",
  );
  expect(saveResult).toBeDefined();
  expect(saveResult).not.toHaveProperty("result.revisions");
});
