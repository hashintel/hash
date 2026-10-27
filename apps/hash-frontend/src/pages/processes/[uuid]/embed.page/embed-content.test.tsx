// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createContext, use, useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { EmbedContent } from "./embed-content";

import type {
  HostNetMode,
  HostToIframeMessage,
  IframeToHostMessage,
} from "../../shared/messages";
import type { EmbedChrome } from "./embed-chrome-context";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  PetrinautAiAutomaticToolExecuteParams,
  useBrunchAssistant,
} from "@hashintel/brunch-agent/ui";
import type { ErrorTracker, PetrinautDocHandle } from "@hashintel/petrinaut";
import type * as PetrinautCore from "@hashintel/petrinaut-core";

/**
 * What each render gave the editor and Brunch's hook, so the two can be
 * compared. Hoisted with the mocks that write to it.
 */
const observed = vi.hoisted(() => ({
  petrinautHandles: [] as PetrinautDocHandle[],
  /** The chrome (Save, version picker) each editor render saw. */
  chromes: [] as unknown[],
  brunchInputs: [] as Parameters<typeof useBrunchAssistant>[0][],
  /** Failures to report from inside the editor and from Brunch's hook. */
  petrinautFailure: null as null | { error: Error; source: string },
  brunchFailure: null as null | { error: Error; source: string },
  /** The HASH host tools the page gives Brunch. */
  hashHostTools: [{ toolName: "query_hash_entities" }],
}));

vi.mock("@hashintel/petrinaut", async () => {
  const core = await vi.importActual<typeof PetrinautCore>(
    "@hashintel/petrinaut-core",
  );
  const { EmbedChromeContext } = await import("./embed-chrome-context");
  const errorTrackerContext = createContext<ErrorTracker>({
    captureException: () => {},
  });
  const Petrinaut = ({ handle }: { handle: PetrinautDocHandle }) => {
    const { captureException } = use(errorTrackerContext);
    observed.petrinautHandles.push(handle);
    observed.chromes.push(use(EmbedChromeContext));
    const failure = observed.petrinautFailure;
    useEffect(() => {
      if (failure) {
        captureException(failure.error, {
          source: failure.source,
          tags: { "petrinaut.plugin": "test" },
        });
      }
    }, [captureException, failure]);
    return null;
  };
  return {
    canonicalizePetrinautIds: core.canonicalizePetrinautIds,
    createJsonDocHandle: core.createJsonDocHandle,
    isSDCPNEqual: core.isSDCPNEqual,
    ErrorTrackerContext: errorTrackerContext,
    PetrinautOptimizationContext: createContext(null),
    Petrinaut,
  };
});

vi.mock("@hashintel/brunch-agent/ui", async () => {
  const { ErrorTrackerContext } = await import("@hashintel/petrinaut");
  return {
    BrunchAssistantContext: createContext(null),
    // Mirrors the hook's contract: its runner's `documentHandle` is the
    // open document's editor handle, and its failures go to the tracker the
    // hook reads where it is called.
    useBrunchAssistant: (input: Parameters<typeof useBrunchAssistant>[0]) => {
      observed.brunchInputs.push(input);
      const { captureException } = use(ErrorTrackerContext);
      const failure = observed.brunchFailure;
      useEffect(() => {
        if (failure) {
          captureException(failure.error, {
            source: failure.source,
            tags: { phase: "absent" },
          });
        }
      }, [captureException, failure]);
      return { assistant: null, plugins: input.plugins };
    },
  };
});

vi.mock("./brunch-hash-graph-reads", () => ({
  useBrunchHashHostTools: () => observed.hashHostTools,
}));

vi.mock("./embed-chrome-plugin", () => ({
  embedChromePlugin: { id: "embed-chrome" },
}));

vi.mock("../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: { accountId: "alice-account" } }),
}));

const definition = {
  places: [
    {
      id: "place",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const savedEntityId = "web~net" as EntityId;

const savedMode: HostNetMode = {
  kind: "saved",
  entityId: savedEntityId,
  userEditable: true,
};

const savedSnapshot = {
  definition,
  title: "Net",
  decisionTime: "2026-10-24T00:00:00.000Z",
};

/** The editor's outgoing bridge messages, delivered to this window as the page does. */
const posted: IframeToHostMessage[] = [];

const sendToEditor = (message: HostToIframeMessage) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data: message, source: window }),
    );
  });

const identityRequests: {
  url: string;
  credentials: RequestInit["credentials"];
}[] = [];

beforeEach(() => {
  observed.petrinautHandles.length = 0;
  observed.chromes.length = 0;
  observed.brunchInputs.length = 0;
  observed.petrinautFailure = null;
  observed.brunchFailure = null;
  posted.length = 0;
  identityRequests.length = 0;
  vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
    posted.push(message as IframeToHostMessage);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((url, init) => {
      identityRequests.push({
        url: url instanceof Request ? url.url : url.toString(),
        credentials: init?.credentials,
      });
      return Promise.resolve(Response.json({ ownerKey: "hash:alice-account" }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lastBrunchInput = () => observed.brunchInputs.at(-1);
const lastEditorHandle = () => lastBrunchInput()?.openDocument?.editor?.handle;

test("Brunch's runner gets the handle the editor shows, and a new one on every load", async () => {
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  const firstHandle = observed.petrinautHandles.at(-1);
  expect(firstHandle).toBeDefined();
  expect(lastEditorHandle()).toBe(firstHandle);
  expect(lastBrunchInput()).toMatchObject({
    ownerKey: "hash:alice-account",
    chatEndpoint: "http://localhost:5001/api/brunch/agents/hash",
    openDocument: { documentId: savedEntityId },
    voice: { enabled: false },
  });
  // The page's graph reads, then the agent's save through the editor's Save.
  expect(lastBrunchInput()?.hostTools).toEqual([
    ...observed.hashHostTools,
    expect.objectContaining({ toolName: brunchTools.saveHashNet }),
  ]);
  expect(identityRequests).toEqual([
    {
      url: "http://localhost:5001/api/brunch/identity",
      credentials: "include",
    },
  ]);
  const brunchFetch = lastBrunchInput()?.fetch;

  // A revision of the same net, with identical content.
  sendToEditor({
    kind: "load",
    definition,
    title: "Net",
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() =>
    expect(observed.petrinautHandles.at(-1)).not.toBe(firstHandle),
  );
  const secondHandle = observed.petrinautHandles.at(-1);
  expect(secondHandle).toBeDefined();
  expect(secondHandle?.doc()).toEqual(firstHandle?.doc());
  expect(secondHandle?.id).not.toBe(firstHandle?.id);
  expect(lastEditorHandle()).toBe(secondHandle);
  // The credentialed fetch keeps its identity, so the conversation's client survives.
  expect(lastBrunchInput()?.fetch).toBe(brunchFetch);
  expect(identityRequests).toHaveLength(1);
});

test("an unsaved draft gets no Brunch", async () => {
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Draft",
    readonly: false,
    mode: { kind: "draft", seedKey: null },
    savedSnapshot: null,
    revisions: [],
  });

  await waitFor(() => expect(observed.petrinautHandles).not.toHaveLength(0));
  await waitFor(() =>
    expect(lastBrunchInput()?.ownerKey).toBe("hash:alice-account"),
  );
  expect(lastBrunchInput()).toMatchObject({
    selected: false,
    openDocument: null,
  });
});

test("Brunch's and Petrinaut's contained failures reach the host's reporter with their tags", async () => {
  observed.brunchFailure = {
    error: new Error("history failed"),
    source: "brunch.history",
  };
  observed.petrinautFailure = {
    error: new Error("plugin failed"),
    source: "plugin",
  };
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() =>
    expect(posted.filter(({ kind }) => kind === "reportError")).toHaveLength(2),
  );
  expect(posted.filter(({ kind }) => kind === "reportError")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "reportError",
        source: "petrinaut",
        message: "history failed",
        mode: savedMode,
        tags: { phase: "absent", "petrinaut.origin": "brunch.history" },
      }),
      expect.objectContaining({
        kind: "reportError",
        source: "petrinaut",
        message: "plugin failed",
        mode: savedMode,
        tags: { "petrinaut.plugin": "test", "petrinaut.origin": "plugin" },
      }),
    ]),
  );
});

test("a save result leaves the revision list the host sent after the save", async () => {
  const firstRevision = {
    decisionTime: savedSnapshot.decisionTime,
    title: "Net",
  };
  const savedRevision = {
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net (edited)",
  };
  const lastChrome = () => observed.chromes.at(-1) as EmbedChrome | undefined;
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [firstRevision],
  });
  await waitFor(() => expect(lastChrome()?.revisions).toEqual([firstRevision]));

  act(() => {
    lastChrome()?.onTitleChange("Net (edited)");
  });
  act(() => {
    lastChrome()?.onSave();
  });
  const request = posted.find(
    (
      message,
    ): message is Extract<IframeToHostMessage, { kind: "requestSave" }> =>
      message.kind === "requestSave",
  );
  expect(request).toBeDefined();

  // The host's history refetch lands first, then the save's reply. A host
  // that still attaches the list from before the save must not win.
  sendToEditor({
    kind: "revisionsList",
    revisions: [savedRevision, firstRevision],
  });
  const staleList = { revisions: [firstRevision] };
  sendToEditor({
    kind: "saveResult",
    requestId: request?.requestId ?? "",
    result: {
      ok: true,
      mode: savedMode,
      savedSnapshot: {
        definition,
        title: "Net (edited)",
        decisionTime: savedRevision.decisionTime,
      },
      ...staleList,
    },
  });

  await waitFor(() =>
    expect(lastChrome()?.loadedRevisionTime).toBe(savedRevision.decisionTime),
  );
  expect(lastChrome()).toMatchObject({
    revisions: [savedRevision, firstRevision],
    isDirty: false,
    persistPending: false,
  });
});

const initEditor = (
  overrides: Partial<Extract<HostToIframeMessage, { kind: "init" }>> = {},
) => {
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [],
    ...overrides,
  });
};

const saveRequests = () =>
  posted.filter(
    (
      message,
    ): message is Extract<IframeToHostMessage, { kind: "requestSave" }> =>
      message.kind === "requestSave",
  );

/** Runs the agent's save as Brunch's panel does, once the user has approved it. */
const agentSave = (
  documentId: string,
  signal = new AbortController().signal,
) => {
  const tool = lastBrunchInput()?.hostTools?.find(
    ({ toolName }) => toolName === brunchTools.saveHashNet,
  );
  if (!tool) {
    throw new Error("The page gave Brunch no save");
  }
  const settled = Promise.resolve(
    tool.execute({
      input: { documentId },
      toolCallId: "save-1",
      signal,
    } as PetrinautAiAutomaticToolExecuteParams),
  );
  const state = { settled: false };
  void settled.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return { settled, state };
};

const editNet = (name: string) =>
  act(() =>
    lastEditorHandle()?.change((draft) => {
      draft.places.push({
        // Already a Petrinaut id, so the saved snapshot keeps it as it is.
        id: crypto.randomUUID(),
        name,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    }),
  );

const lastChrome = () => observed.chromes.at(-1) as EmbedChrome | undefined;

test("the agent's save sends the Save button's one request and settles from its result, still dirty for an edit made after it", async () => {
  initEditor();
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  editNet("before-save");
  const captured = lastEditorHandle()?.doc();

  const save = agentSave(savedEntityId);
  await waitFor(() => expect(saveRequests()).toHaveLength(1));
  const [request] = saveRequests();
  expect(request).toEqual({
    kind: "requestSave",
    requestId: expect.any(String),
    definition: captured,
    title: "Net",
  });
  await waitFor(() => expect(lastChrome()?.persistPending).toBe(true));
  editNet("after-save");

  // Another request's result is not this save's.
  sendToEditor({
    kind: "saveResult",
    requestId: "another-request",
    result: { ok: false, error: "Not this one" },
  });
  await act(async () => {});
  expect(save.state.settled).toBe(false);

  const decisionTime = "2026-10-24T01:00:00.000Z";
  sendToEditor({
    kind: "saveResult",
    requestId: request?.requestId ?? "",
    result: {
      ok: true,
      mode: savedMode,
      savedSnapshot: {
        definition: request?.definition ?? definition,
        title: "Net",
        decisionTime,
      },
    },
  });

  await expect(save.settled).resolves.toEqual({
    saved: true,
    decisionTime,
    title: "Net",
    stillDirty: true,
  });
  expect(saveRequests()).toHaveLength(1);
  await waitFor(() =>
    expect(lastChrome()).toMatchObject({
      isDirty: true,
      persistPending: false,
      loadedRevisionTime: decisionTime,
    }),
  );
});

test("the agent's save of a net with nothing edited since reports it clean", async () => {
  initEditor();
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  editNet("edited");
  const save = agentSave(savedEntityId);
  await waitFor(() => expect(saveRequests()).toHaveLength(1));
  const [request] = saveRequests();
  sendToEditor({
    kind: "saveResult",
    requestId: request?.requestId ?? "",
    result: {
      ok: true,
      mode: savedMode,
      savedSnapshot: {
        definition: request?.definition ?? definition,
        title: "Net",
        decisionTime: "2026-10-24T01:00:00.000Z",
      },
    },
  });
  await expect(save.settled).resolves.toMatchObject({
    saved: true,
    stillDirty: false,
  });
});

test("a failed save settles with its error after its one request, and nothing retries it", async () => {
  initEditor();
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  const save = agentSave(savedEntityId);
  await waitFor(() => expect(saveRequests()).toHaveLength(1));
  sendToEditor({
    kind: "saveResult",
    requestId: saveRequests()[0]?.requestId ?? "",
    result: {
      ok: false,
      error:
        "Persist appeared to succeed but the entity wasn't visible on refetch",
    },
  });

  await expect(save.settled).resolves.toEqual({
    saved: false,
    error:
      "Persist appeared to succeed but the entity wasn't visible on refetch",
  });
  await act(async () => {});
  expect(saveRequests()).toHaveLength(1);
  // The editor stays as the button leaves it: dirty against the old snapshot.
  expect(lastChrome()?.loadedRevisionTime).toBe(savedSnapshot.decisionTime);
});

test.each([
  {
    refused: "another net",
    init: {},
    documentId: "web~other" as EntityId,
    reason: "That isn't the net open in the editor.",
  },
  {
    refused: "a read-only net",
    init: { readonly: true },
    documentId: savedEntityId,
    reason: "The user can't edit this net, so they can't save it.",
  },
  {
    refused: "a draft",
    init: {
      mode: { kind: "draft", seedKey: null } as const,
      savedSnapshot: null,
    },
    documentId: savedEntityId,
    reason:
      "The net is an unsaved draft, which the user creates with the editor's Create.",
  },
])(
  "the agent's save of $refused is refused as not started and sends nothing",
  async ({ init, documentId, reason }) => {
    initEditor(init);
    await waitFor(() => expect(lastBrunchInput()?.hostTools).toBeDefined());
    expect(lastBrunchInput()?.readSaveState?.(documentId).refusal).toBe(reason);
    await expect(agentSave(documentId).settled).resolves.toEqual({
      applied: false,
      reason,
    });
    expect(saveRequests()).toEqual([]);
  },
);

test("the agent's save while a save is pending is refused as not started, and the card shows the net's title and last save", async () => {
  initEditor({ revisions: [] });
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  expect(lastBrunchInput()?.readSaveState?.(savedEntityId)).toEqual({
    title: "Net",
    lastSavedTime: savedSnapshot.decisionTime,
    refusal: null,
  });
  act(() => {
    lastChrome()?.onSave();
  });
  await waitFor(() => expect(lastChrome()?.persistPending).toBe(true));

  await expect(agentSave(savedEntityId).settled).resolves.toEqual({
    applied: false,
    reason: "A save of this net is already in progress.",
  });
  expect(saveRequests()).toHaveLength(1);
});

test("a load before the save's result leaves the agent's save unsettled until Brunch aborts it", async () => {
  initEditor();
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  const controller = new AbortController();
  const save = agentSave(savedEntityId, controller.signal);
  await waitFor(() => expect(saveRequests()).toHaveLength(1));

  sendToEditor({
    kind: "load",
    definition,
    title: "Net",
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });
  // The late result is ignored, as it is for the button.
  sendToEditor({
    kind: "saveResult",
    requestId: saveRequests()[0]?.requestId ?? "",
    result: {
      ok: true,
      mode: savedMode,
      savedSnapshot: { ...savedSnapshot, decisionTime: "late" },
    },
  });
  await act(async () => {});
  expect(save.state.settled).toBe(false);

  controller.abort(new Error("Brunch stopped the turn"));
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");
});
