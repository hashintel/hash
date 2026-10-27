/** @vitest-environment jsdom */
import { FlueApiError } from "@flue/sdk";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools, ledgerCommentsMessage } from "@hashintel/brunch-agent";
import {
  createExperimentToolName,
  createJsonDocHandle,
  createPetrinaut,
  toPetrinautId,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "../client/conversation/brunch-conversation-id";
import {
  brunchPetrinautClientToolNames,
  canonicalPetrinautClientToolNames,
} from "../client/tools/brunch-client-tools";
import { OpenAIRealtimeSession } from "../client/voice/realtime/openai-realtime-session";
import { createTestEditorApi } from "./chat/testing/create-test-editor-api";
import { InterviewBudgetControl } from "./interview-budget/interview-budget-control";
import { documentRevisionOf } from "./tools/shared/document-revision";
import { useBrunchAssistant } from "./use-brunch-assistant";

import type { createBrunchFlueAdapter } from "../client/brunch-flue-adapter";
import type {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../client/brunch-panel-transport";
import type { PetrinautAiAssistant } from "./chat/petrinaut";
import type { BrunchMutationApprovalCoordinator } from "./tools/brunch-mutation-approval";
import type { BrunchOpenDocument } from "./use-brunch-assistant";
import type {
  AgentConversationObservationSnapshot,
  AgentSendResult,
} from "@flue/sdk";

const netOneId = toPetrinautId("net-1");
const netTwoId = toPetrinautId("net-2");
const flueClientMock = vi.hoisted(() => ({ current: null as unknown }));
const brunchFlueAdapterTools = vi.hoisted(() => ({
  current: undefined as
    | Parameters<typeof createBrunchFlueAdapter>[0]
    | undefined,
}));
const brunchPanelTransportOptions = vi.hoisted(() => ({
  current: undefined as Parameters<typeof createBrunchPanelTransport>[2],
}));
const brunchPanelTransportTracker = vi.hoisted(() => ({
  current: null as BrunchPanelConversationTracker | null,
}));
const brunchPanelTransportSessions = vi.hoisted(
  () =>
    [] as {
      readonly client: unknown;
      readonly tracker: BrunchPanelConversationTracker;
    }[],
);
const mutationApprovalCoordinators = vi.hoisted(
  () => [] as { close: () => void }[],
);

vi.mock("@flue/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/sdk")>()),
  createFlueClient: () => flueClientMock.current,
}));
vi.mock("./tools/brunch-mutation-approval", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./tools/brunch-mutation-approval")>();
  return {
    ...actual,
    createBrunchMutationApprovalCoordinator: () => {
      const coordinator = actual.createBrunchMutationApprovalCoordinator();
      vi.spyOn(coordinator, "close");
      mutationApprovalCoordinators.push(coordinator);
      return coordinator;
    },
  };
});
vi.mock("../client/brunch-flue-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../client/brunch-flue-adapter")>();
  return {
    ...actual,
    createBrunchFlueAdapter: (
      ...args: Parameters<typeof actual.createBrunchFlueAdapter>
    ) => {
      brunchFlueAdapterTools.current = args[0];
      return actual.createBrunchFlueAdapter(...args);
    },
  };
});
vi.mock("../client/brunch-panel-transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../client/brunch-panel-transport")>();
  return {
    ...actual,
    createBrunchPanelTransport: (
      ...args: Parameters<typeof actual.createBrunchPanelTransport>
    ) => {
      brunchPanelTransportOptions.current = args[2];
      brunchPanelTransportTracker.current = args[1];
      brunchPanelTransportSessions.push({ client: args[0], tracker: args[1] });
      return actual.createBrunchPanelTransport(...args);
    },
  };
});

const emptyDefinition = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};
const openDocument = (documentId = netOneId): BrunchOpenDocument => ({
  documentId,
  editor: {
    handle: createJsonDocHandle({
      id: documentId,
      initial: structuredClone(emptyDefinition),
    }),
    readTitle: () => documentId,
  },
});
const captureException = vi.fn();
const ErrorTracker = ({ children }: { children: ReactNode }) => (
  <ErrorTrackerContext value={{ captureException }}>
    {children}
  </ErrorTrackerContext>
);
const renderAssistant = (
  overrides: Partial<Parameters<typeof useBrunchAssistant>[0]> = {},
) => {
  const input: Parameters<typeof useBrunchAssistant>[0] = {
    ownerKey: "test-owner",
    chatEndpoint: "/agents/petrinaut",
    selected: true,
    openDocument: openDocument(),
    voice: { enabled: false, realtime: false },
    interviewBudget: { enabled: false, level: "off", setLevel: vi.fn() },
    words: { enabled: false },
    ...overrides,
  };
  const rendered = renderHook((props) => useBrunchAssistant(props), {
    initialProps: input,
    wrapper: ErrorTracker,
  });
  return {
    ...rendered,
    input,
    assistant: () => {
      const assistant = rendered.result.current.assistant;
      if (assistant === null)
        throw new Error("Brunch's assistant is not ready");
      return assistant;
    },
  };
};

const executeAutomaticTool = (
  assistant: PetrinautAiAssistant,
  toolName: string,
  toolCallId: string,
  input: unknown,
) => {
  const handle = assistant.documentHandle;
  const tool = assistant.automaticTools?.find(
    (candidate) => candidate.toolName === toolName,
  );
  if (handle === undefined || tool === undefined)
    throw new Error("Missing bound automatic tool");
  const edit = createTestEditorApi(createPetrinaut({ document: handle }))
    .document.edit;
  // Preserve the original tests' accepted no-op edits: the runner must report no document change.
  const acceptedNoOp = () => ({ applied: true as const, value: undefined });
  return tool.execute({
    handle,
    input,
    toolCallId,
    edit: {
      ...edit,
      addPlace: acceptedNoOp,
      addTransition: acceptedNoOp,
      addArc: acceptedNoOp,
    },
    readDiagnosticsContext: async () => "",
    signal: new AbortController().signal,
  });
};
const placeInput = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  targetSubnetId: null,
};

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => {},
    }),
  };
  brunchPanelTransportSessions.length = 0;
  mutationApprovalCoordinators.length = 0;
  brunchPanelTransportOptions.current = undefined;
  brunchFlueAdapterTools.current = undefined;
  brunchPanelTransportTracker.current = null;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => Response.json({ available: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("registers no brunch_ask tool in the document-bound Brunch assistant", async () => {
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: false }),
    ),
  );

  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  await waitFor(() => expect(currentAssistant()).not.toBeNull());
  const aiAssistant = currentAssistant() as PetrinautAiAssistant;

  expect(aiAssistant.requestStop).toBeTypeOf("function");
  expect(aiAssistant.executeMutation).toBeUndefined();
  expect(aiAssistant.interactiveTools?.map(({ toolName }) => toolName)).toEqual(
    expect.arrayContaining([
      brunchTools.draftPetrinautExperiment,
      "removePlace",
    ]),
  );
  expect(aiAssistant.resolveToolPresentation).toBeTypeOf("function");
  expect(aiAssistant.workingLabel).toBe("Working…");
  expect(
    aiAssistant.resolveToolPresentation?.({
      toolName: "layout_petrinaut_net",
      state: "success",
      input: {},
      output: {},
      error: undefined,
    }),
  ).toBeUndefined();
  expect(
    aiAssistant.interactiveTools?.some(
      ({ toolName }) => toolName === "brunch_ask",
    ),
  ).toBe(false);
  expect(aiAssistant.automaticTools?.map(({ toolName }) => toolName)).toEqual([
    "getLatestNetDefinition",
    "readNetOutline",
    "readNetStructure",
    "getNetCompilationErrors",
    "addPlace",
    "addTransition",
    "addArc",
  ]);

  const mutationApprovalCoordinator = mutationApprovalCoordinators.at(-1);
  expect(mutationApprovalCoordinator).toBeDefined();
  rendered.unmount();
  expect(mutationApprovalCoordinator?.close).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

test("waits for a durable offset before baselining present Ledger history", async () => {
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({
        conversation: {
          conversationId: "present-without-offset",
          settlements: [],
          messages: [],
        },
        offset: undefined,
        phase: "live",
        error: undefined,
      }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: false }),
    ),
  );

  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  await waitFor(() => expect(currentAssistant()).not.toBeNull());

  expect(
    (currentAssistant() as PetrinautAiAssistant).additionalTab
      ?.activityIdentities,
  ).toBeUndefined();

  rendered.unmount();
  vi.unstubAllGlobals();
});

test("keeps durable Flue Stop distinct from local playback cancellation", async () => {
  let snapshot: AgentConversationObservationSnapshot = {
    conversation: {
      conversationId: "conversation-stop",
      settlements: [],
      messages: [],
    },
    offset: "offset-before-stop",
    phase: "live" as const,
    error: undefined,
  };
  const listeners = new Set<() => void>();
  const localPlaybackCancellation = vi.spyOn(
    OpenAIRealtimeSession.prototype,
    "cancelOutput",
  );
  const abort = vi.fn(async () => {
    snapshot = {
      conversation: {
        conversationId: "conversation-stop",
        settlements: [
          { submissionId: "submission-stop", outcome: "aborted" as const },
        ],
        messages: [],
      },
      offset: "offset-after-stop",
      phase: "live" as const,
      error: undefined,
    };
    for (const listener of listeners) listener();
    return { aborted: true };
  });
  flueClientMock.current = {
    abort,
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => snapshot,
      refresh: vi.fn(),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: false }),
    ),
  );

  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  await waitFor(() =>
    expect((currentAssistant() as PetrinautAiAssistant).requestStop).toBeTypeOf(
      "function",
    ),
  );
  const aiAssistant = currentAssistant() as PetrinautAiAssistant;

  await expect(aiAssistant.requestStop?.()).resolves.toBe("stop-requested");
  expect(abort).toHaveBeenCalledOnce();
  expect(localPlaybackCancellation).not.toHaveBeenCalled();
  expect(
    (currentAssistant() as PetrinautAiAssistant).renderComposerControl,
  ).toBeTypeOf("function");

  rendered.unmount();
  localPlaybackCancellation.mockRestore();
  vi.unstubAllGlobals();
});

test("a destructive edit waiting for approval settles when the conversation is replaced", async () => {
  flueClientMock.current = {
    url: "http://brunch.local/agents/petrinaut/instance",
    history: async () => ({
      conversation: { settlements: [], messages: [] },
      offset: "0",
    }),
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => {},
    }),
  };
  const posted: unknown[] = [];
  const claimed = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const target = new URL(url instanceof Request ? url.url : url);
      if (!target.pathname.includes("/browser-calls/remove-1"))
        return new Response(null, { status: 404 });
      if (init?.method === "POST") {
        posted.push(
          typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        );
        return new Response(null, { status: 200 });
      }
      claimed();
      return Response.json({
        capability: "capability",
        binding: target.searchParams.get("binding"),
        toolName: "removePlace",
        input: { placeId: toPetrinautId("queue") },
      });
    }),
  );
  try {
    const rendered = renderAssistant();
    const currentAssistant = rendered.assistant;
    await waitFor(() =>
      expect(currentAssistant().inBandBrowserTools).toBeDefined(),
    );
    const assistant = currentAssistant() as PetrinautAiAssistant;
    const initialTools = assistant.interactiveTools;
    const execute = vi.fn(async () => ({ applied: true }));
    const run = assistant.inBandBrowserTools?.run(
      {
        toolCallId: "remove-1",
        toolName: "removePlace",
        input: { placeId: toPetrinautId("queue") },
        signal: new AbortController().signal,
      },
      execute,
    );
    const interactiveTools = () => currentAssistant().interactiveTools;
    await waitFor(() => expect(claimed).toHaveBeenCalled());
    await waitFor(() => expect(interactiveTools()).not.toBe(initialTools));
    const waitingTools = interactiveTools();
    act(() => assistant.onClearMessages?.());

    await run;
    expect(interactiveTools()).not.toBe(waitingTools);
    expect(execute).not.toHaveBeenCalled();
    expect(posted).toEqual([
      expect.objectContaining({
        output: {
          applied: false,
          reason: "The destructive edit was stopped before approval.",
        },
      }),
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});

/** The bound browser's side of one agent save: its claim, and what it posts back. */
const stubSaveCall = (expectedRevision: string) => {
  const posted: { readonly path: string; readonly body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const target = new URL(url instanceof Request ? url.url : url);
      if (!target.pathname.includes("/browser-calls/save-1"))
        return new Response(null, { status: 404 });
      if (init?.method === "POST") {
        posted.push({
          path: target.pathname,
          body:
            typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        });
        return new Response(null, { status: 200 });
      }
      return Response.json({
        capability: "capability",
        binding: target.searchParams.get("binding"),
        toolName: brunchTools.saveHashNet,
        input: { documentId: netOneId },
        expectedRevision,
      });
    }),
  );
  return posted;
};

const handEdit = (handle: PetrinautDocHandle) =>
  act(() =>
    handle.change((draft) => {
      draft.places.push({
        id: "hand-place",
        name: "Hand place",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    }),
  );

/** A bound assistant whose host can save, waiting on an issued save's card. */
const renderSaveAwaitingCard = async (
  expectedRevisionOf: (handle: PetrinautDocHandle) => string,
  execute: (issuedInput: unknown) => Promise<unknown>,
) => {
  flueClientMock.current = {
    url: "http://brunch.local/agents/hash/instance",
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({
        conversation: {
          conversationId: "save-conversation",
          settlements: [],
          messages: [],
        },
        offset: "save-offset",
        phase: "live",
        error: undefined,
      }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  const document = openDocument();
  const handle = document.editor?.handle;
  if (handle === undefined) throw new Error("Missing document handle");
  const posted = stubSaveCall(expectedRevisionOf(handle));
  const rendered = renderAssistant({
    openDocument: document,
    readSaveState: () => ({
      title: "Net",
      lastSavedTime: null,
      refusal: null,
    }),
  });
  await waitFor(() =>
    expect(rendered.assistant().inBandBrowserTools).toBeDefined(),
  );
  // The history baseline is in, so an allowed call may start.
  await waitFor(() =>
    expect(() =>
      executeAutomaticTool(
        rendered.assistant(),
        "getLatestNetDefinition",
        "history-probe",
        {},
      ),
    ).not.toThrow(),
  );
  const run = rendered.assistant().inBandBrowserTools?.run(
    {
      toolCallId: "save-1",
      toolName: brunchTools.saveHashNet,
      input: { documentId: netOneId },
      signal: new AbortController().signal,
    },
    execute,
  );
  const coordinator = () =>
    mutationApprovalCoordinators.at(-1) as BrunchMutationApprovalCoordinator;
  await waitFor(() => expect(coordinator().hasPending("save-1")).toBe(true));
  return { handle, posted, run, coordinator };
};

test("a save allowed after a hand edit of the net is refused as stale and never runs", async () => {
  try {
    const execute = vi.fn(async () => ({ saved: true }));
    const { handle, posted, run, coordinator } = await renderSaveAwaitingCard(
      (current) => documentRevisionOf(current.doc() ?? emptyDefinition),
      execute,
    );
    handEdit(handle);
    coordinator().resolve("save-1", "allow");

    await expect(run).rejects.toThrow(
      "The document changed by other means after the agent's last view of the net; the call was not started.",
    );
    expect(execute).not.toHaveBeenCalled();
    expect(posted.map(({ path }) => path)).toEqual([
      expect.stringMatching(/\/browser-calls\/save-1\/fail$/u),
    ]);
    expect(posted[0]?.body).toMatchObject({ disposition: "stale" });
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a hand edit while an allowed save is pending is not credited to the agent", async () => {
  try {
    const saved = {
      saved: true,
      decisionTime: "2026-10-24T01:00:00.000Z",
      title: "Net",
      stillDirty: true,
    };
    let editDuringSave = () => {};
    const { handle, posted, run, coordinator } = await renderSaveAwaitingCard(
      (current) => documentRevisionOf(current.doc() ?? emptyDefinition),
      async () => {
        editDuringSave();
        return saved;
      },
    );
    editDuringSave = () => handEdit(handle);
    coordinator().resolve("save-1", "allow");

    await run;
    expect(handle.doc()?.places).toHaveLength(1);
    expect(posted.map(({ path }) => path)).toEqual([
      expect.stringMatching(/\/browser-calls\/save-1$/u),
    ]);
    expect(posted[0]?.body).toMatchObject({ output: saved });
    // No revision edge or read-back: the edit isn't presented as the save's.
    expect(posted[0]?.body).not.toHaveProperty("metadata");
  } finally {
    vi.unstubAllGlobals();
  }
});

test("mounts document-bound Brunch with canonical overrides and the complete static catalogue", async () => {
  flueClientMock.current = {
    history: async () => ({
      conversation: {
        conversationId: ordinaryConstructionConversationIdFrom(netOneId),
        settlements: [],
        messages: [],
      },
      offset: "offset-0",
    }),
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };

  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  await waitFor(() => expect(currentAssistant()).toBeDefined());
  const aiAssistant = currentAssistant() as PetrinautAiAssistant;
  const transportOptions = brunchPanelTransportOptions.current as {
    readonly initialData?: { readonly binding?: unknown };
  };
  const adapterTools = brunchFlueAdapterTools.current as {
    readonly clientToolNames?: ReadonlySet<string>;
    readonly dynamicClientToolNames?: ReadonlySet<string>;
  };

  const conversationId = brunchEvaluationConversationIdFrom(
    ordinaryConstructionConversationIdFrom(netOneId),
  );
  expect(aiAssistant.conversationId).toBe(conversationId);
  expect(aiAssistant.executeMutation).toBeUndefined();
  expect(aiAssistant.documentHandle).toBe(
    rendered.input.openDocument?.editor?.handle,
  );
  expect(aiAssistant.automaticTools?.map(({ toolName }) => toolName)).toEqual([
    "getLatestNetDefinition",
    "readNetOutline",
    "readNetStructure",
    "getNetCompilationErrors",
    "addPlace",
    "addTransition",
    "addArc",
  ]);
  expect(aiAssistant.primaryLabel).toBe("Chat");
  expect(aiAssistant.additionalTab?.label).toBe("Ledger");
  expect(
    aiAssistant.resolveToolPresentation?.({
      toolName: "layout_petrinaut_net",
      state: "pending",
      input: {},
      output: undefined,
      error: undefined,
    }),
  ).toBeUndefined();
  expect(transportOptions.initialData?.binding).toEqual({
    conversationId,
    documentId: netOneId,
    incarnationId: netOneId,
  });
  expect([...(adapterTools.clientToolNames ?? [])].toSorted()).toEqual(
    [...brunchPetrinautClientToolNames].toSorted(),
  );
  expect(aiAssistant.interactiveTools?.map(({ toolName }) => toolName)).toEqual(
    expect.arrayContaining([
      brunchTools.draftPetrinautExperiment,
      "removePlace",
    ]),
  );
  // Every configured Brunch browser tool, the draft included, settles in band.
  expect(aiAssistant.inBandBrowserTools?.has(createExperimentToolName)).toBe(
    true,
  );
  expect(
    aiAssistant.inBandBrowserTools?.has(brunchTools.draftPetrinautExperiment),
  ).toBe(false);
  // I captures the experiment source at the browser lane barrier, not while projecting transport input.
  expect([...(adapterTools.dynamicClientToolNames ?? [])].toSorted()).toEqual(
    [
      ...canonicalPetrinautClientToolNames,
      "readNetOutline",
      "readNetStructure",
      brunchTools.draftPetrinautExperiment,
      brunchTools.queryHashEntities,
      brunchTools.queryHashEntityTypes,
      brunchTools.queryHashWebs,
      brunchTools.saveHashNet,
    ].toSorted(),
  );
  expect(aiAssistant.inBandBrowserTools?.has("readNetOutline")).toBe(true);
  // A host that can't save offers no save card.
  expect(
    aiAssistant.interactiveTools?.map(({ toolName }) => toolName),
  ).not.toContain(brunchTools.saveHashNet);
});

test("a host's own tools run beside Brunch's while a document is bound", async () => {
  flueClientMock.current = {
    history: async () => ({
      conversation: {
        conversationId: ordinaryConstructionConversationIdFrom(netOneId),
        settlements: [],
        messages: [],
      },
      offset: "offset-0",
    }),
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  const hashRead = {
    toolName: brunchTools.queryHashEntities,
    inputSchema: { parse: (value: unknown) => value },
    outputSchema: { parse: (value: unknown) => value },
    execute: async () => ({ entities: [] }),
  };

  const rendered = renderAssistant({ hostTools: [hashRead] });
  await waitFor(() => expect(rendered.assistant()).toBeDefined());
  const aiAssistant = rendered.assistant();

  expect(aiAssistant.automaticTools?.at(-1)).toBe(hashRead);
  expect(aiAssistant.automaticTools?.map(({ toolName }) => toolName)).toEqual(
    expect.arrayContaining(["getLatestNetDefinition", "readNetOutline"]),
  );
  expect(
    aiAssistant.inBandBrowserTools?.has(brunchTools.queryHashEntities),
  ).toBe(true);

  rendered.rerender({ ...rendered.input, openDocument: null });
  expect(rendered.result.current.assistant?.automaticTools ?? []).not.toContain(
    hashRead,
  );
});

test("an absent replay baseline stays immutable when admission refresh publishes its live calls", async () => {
  let snapshot: AgentConversationObservationSnapshot = {
    conversation: undefined,
    offset: undefined,
    phase: "absent",
    error: undefined,
  };
  const subscribers = new Set<() => void>();
  const refresh = vi.fn(() => {
    for (const subscriber of subscribers) subscriber();
  });
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => snapshot,
      refresh,
      subscribe: (subscriber: () => void) => {
        subscribers.add(subscriber);
        return () => subscribers.delete(subscriber);
      },
    }),
  };

  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  const executeCurrentReadCall = (toolCallId: string) =>
    executeAutomaticTool(
      currentAssistant(),
      "getLatestNetDefinition",
      toolCallId,
      {},
    );
  const executeCurrentCanonicalMutation = (
    toolCallId: string,
    toolName: string,
    input: unknown,
  ) => executeAutomaticTool(currentAssistant(), toolName, toolCallId, input);
  await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
  // The baseline is the history the editor first shows: wait until it is the
  // absent one, before the admission publishes live calls.
  await waitFor(() =>
    expect(currentAssistant().additionalTab?.activityIdentities).toEqual([]),
  );
  const initialTools = currentAssistant().automaticTools;
  const canonicalInput = {
    id: "canonical-live",
    name: "CanonicalLive",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
    targetSubnetId: null,
  };
  const conversationId = currentAssistant().conversationId ?? "";
  snapshot = {
    conversation: {
      conversationId,
      settlements: [],
      messages: [
        {
          role: "assistant",
          purpose: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "query_basis",
              toolCallId: "ledger-query",
              state: "output-available",
              input: {},
              output: {
                binding: {
                  conversationId,
                  documentId: netOneId,
                  incarnationId: netOneId,
                },
                disposition: "not-found",
                changes: [],
              },
            },
            {
              type: "dynamic-tool",
              toolName: "getLatestNetDefinition",
              toolCallId: "live-read",
              state: "input-available",
              input: {},
            },
            {
              type: "dynamic-tool",
              toolName: "addPlace",
              toolCallId: "live-mutation",
              state: "input-available",
              input: canonicalInput,
            },
          ],
        },
      ] as never,
    },
    offset: "admitted-offset",
    phase: "live",
    error: undefined,
  };

  act(() => {
    (
      brunchPanelTransportOptions.current as { onAdmission?: () => void }
    ).onAdmission?.();
  });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());

  for (const initialTool of initialTools ?? []) {
    expect(
      currentAssistant().automaticTools?.find(
        ({ toolName }) => toolName === initialTool.toolName,
      ),
    ).toBe(initialTool);
  }
  const readOutput = executeCurrentReadCall("live-read");
  expect(
    typeof readOutput === "object" &&
      readOutput !== null &&
      "definition" in readOutput,
  ).toBe(true);
  const canonicalOutput = (await executeCurrentCanonicalMutation(
    "live-mutation",
    "addPlace",
    canonicalInput,
  )) as { applied?: boolean; reason?: string } | undefined;
  expect(canonicalOutput?.applied).toBe(false);
  const handle = currentAssistant().documentHandle as
    | PetrinautDocHandle
    | undefined;
  expect(handle?.doc()?.places).toHaveLength(0);

  const toolsAfterCalls = currentAssistant().automaticTools;
  snapshot = { ...snapshot, offset: "terminal-offset" };
  act(() => refresh());
  for (const retainedTool of toolsAfterCalls ?? []) {
    expect(
      currentAssistant().automaticTools?.find(
        ({ toolName }) => toolName === retainedTool.toolName,
      ),
    ).toBe(retainedTool);
  }
  expect(executeCurrentReadCall("live-read")).toEqual(readOutput);
  expect(
    executeCurrentCanonicalMutation(
      "live-mutation",
      "addPlace",
      canonicalInput,
    ),
  ).toEqual(canonicalOutput);
});

test("I does not execute a canonical write while history is loading", async () => {
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "loading" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  const executeCurrentReadCall = (toolCallId: string) =>
    executeAutomaticTool(
      currentAssistant(),
      "getLatestNetDefinition",
      toolCallId,
      {},
    );
  const executeCurrentCanonicalMutation = (
    toolCallId: string,
    toolName: string,
    input: unknown,
  ) => executeAutomaticTool(currentAssistant(), toolName, toolCallId, input);
  await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
  expect(() => executeCurrentReadCall("loading-read")).toThrow(
    "Conversation history is not ready",
  );
  expect(() =>
    executeCurrentCanonicalMutation("loading-place", "addPlace", {
      id: "blocked",
      name: "Blocked",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
      targetSubnetId: null,
    }),
  ).toThrow("Conversation history is not ready");
  const handle = currentAssistant().documentHandle as PetrinautDocHandle;
  expect(handle.doc()?.places).toEqual([]);
});

test("a pending bound mutation in history is not executed again after reload", async () => {
  const pendingPlace = {
    id: "pending",
    name: "Pending",
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
    targetSubnetId: null,
  };
  flueClientMock.current = {
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({
        conversation: {
          conversationId: "pending-conversation",
          settlements: [],
          messages: [
            {
              role: "assistant",
              purpose: "assistant",
              parts: [
                {
                  type: "dynamic-tool",
                  toolName: "addPlace",
                  toolCallId: "pending-mutation",
                  state: "input-available",
                  input: pendingPlace,
                },
              ],
            },
          ],
        },
        offset: "pending-offset",
        phase: "live",
        error: undefined,
      }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  const executeCurrentCanonicalMutation = (
    toolCallId: string,
    toolName: string,
    input: unknown,
  ) => executeAutomaticTool(currentAssistant(), toolName, toolCallId, input);
  await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
  await waitFor(() =>
    expect(() =>
      executeCurrentCanonicalMutation(
        "pending-mutation",
        "addPlace",
        pendingPlace,
      ),
    ).toThrow(/already attempted/u),
  );
  const handle = currentAssistant().documentHandle as PetrinautDocHandle;
  expect(handle.doc()?.places).toEqual([]);
});

test("keeps one session across revisions and replaces one client/tracker pair when document identity changes", async () => {
  const rendered = renderAssistant();
  await waitFor(() =>
    expect(brunchPanelTransportSessions.length).toBeGreaterThan(0),
  );
  const uniqueSessions = () => [
    ...new Map(
      brunchPanelTransportSessions.map((session) => [session.client, session]),
    ).values(),
  ];
  const firstSession = uniqueSessions().at(0);
  expect(firstSession).toBeDefined();
  const handle = rendered.assistant().documentHandle;
  if (handle === undefined) throw new Error("Missing document handle");
  act(() =>
    handle.change((draft) => {
      draft.places.push({
        id: "first-place",
        name: "First place",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      });
    }),
  );
  // A new host container for another revision of the same document is not a new binding.
  rendered.rerender({
    ...rendered.input,
    openDocument: {
      ...rendered.input.openDocument!,
      editor: { handle, readTitle: () => "Revised title" },
    },
  });
  expect(uniqueSessions()).toEqual([firstSession]);
  rendered.rerender({
    ...rendered.input,
    openDocument: openDocument(netTwoId),
  });
  await waitFor(() => expect(uniqueSessions()).toHaveLength(2));
  const secondSession = uniqueSessions().at(1);
  expect(secondSession?.client).not.toBe(firstSession?.client);
  expect(secondSession?.tracker).not.toBe(firstSession?.tracker);
});

test("a document change resets the replay baseline and live-call adapter", async () => {
  const rendered = renderAssistant();
  const currentAssistant = rendered.assistant;
  await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
  const firstMutation = currentAssistant().automaticTools?.find(
    ({ toolName }) => toolName === "addPlace",
  );
  const firstOutput = await waitFor(() =>
    executeAutomaticTool(currentAssistant(), "addPlace", "reused-call", {
      ...placeInput,
      id: "first-place",
      name: "FirstPlace",
    }),
  );
  expect(firstOutput).toHaveProperty("applied");
  rendered.rerender({
    ...rendered.input,
    openDocument: openDocument(netTwoId),
  });
  await waitFor(() =>
    expect(
      currentAssistant().automaticTools?.find(
        ({ toolName }) => toolName === "addPlace",
      ),
    ).not.toBe(firstMutation),
  );
  const secondOutput = await waitFor(() =>
    executeAutomaticTool(currentAssistant(), "addPlace", "reused-call", {
      ...placeInput,
      id: "second-place",
      name: "SecondPlace",
    }),
  );
  expect(secondOutput).toHaveProperty("applied");
});

test.each(["standard", "thorough", "off"] as const)(
  "projects interview length %s into transport and Voice input tracking",
  async (savedLevel) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          available: true,
          provider: "live",
          connectionTimeoutMs: 10_000,
        }),
      ),
    );
    const rendered = renderAssistant({
      voice: { enabled: true, realtime: false },
      interviewBudget: { enabled: false, level: savedLevel, setLevel: vi.fn() },
    });
    await waitFor(() =>
      expect(rendered.assistant().renderVoiceMode).toBeDefined(),
    );
    const context = {
      conversationId: "labs-test",
      messages: [],
      status: "ready" as const,
      stop: vi.fn(async () => {}),
      submitText: vi.fn(),
    };
    const expectBudget = (enabled: boolean) => {
      const level = enabled ? savedLevel : "off";
      expect(brunchPanelTransportOptions.current).toEqual(
        expect.objectContaining({ interviewBudgetLevel: level }),
      );
      const assistant = rendered.assistant();
      const composer = assistant.renderComposerControl?.(context);
      if (!isValidElement<{ children: ReactNode }>(composer))
        throw new Error("Missing composer controls");
      expect(
        Children.toArray(composer.props.children).some(
          (child) =>
            isValidElement(child) && child.type === InterviewBudgetControl,
        ),
      ).toBe(enabled);
      expect(Boolean(assistant.renderComposerStatus?.(context))).toBe(enabled);
      const voice = assistant.renderVoiceMode?.({
        ...context,
        inputMode: "voice",
        isAiAssistantOpen: true,
        canAcceptVoiceInput: true,
        registerVoiceModeControls: vi.fn(() => () => {}),
        reportVoiceSessionState: vi.fn(),
        setInputMode: vi.fn(),
        setVoiceActive: vi.fn(),
        submitVoiceInput: vi.fn(),
      });
      if (
        !isValidElement<{
          interviewBudgetLevel: string;
          onInputModeChange?: (mode: "text" | "voice") => void;
        }>(voice)
      )
        throw new Error("Missing Voice control");
      expect(voice.props.interviewBudgetLevel).toBe(level);
      voice.props.onInputModeChange?.("voice");
      expect(brunchPanelTransportTracker.current?.inputMode).toBe("voice");
      voice.props.onInputModeChange?.("text");
      expect(brunchPanelTransportTracker.current?.inputMode).toBe("text");
    };
    expectBudget(false);
    rendered.rerender({
      ...rendered.input,
      interviewBudget: { ...rendered.input.interviewBudget, enabled: true },
    });
    expectBudget(true);
    rendered.rerender(rendered.input);
    expectBudget(false);
  },
);

// Canonical messages as Flue materializes them: ids of its own, distinct from
// the client message ids, and the submission that delivered each.
const highlightUser = (id: string, text: string, submissionId?: string) => ({
  id,
  role: "user",
  purpose: "user",
  ...(submissionId === undefined ? {} : { submissionId }),
  parts: [{ type: "text", text }],
});
const highlightComments = ledgerCommentsMessage([
  { id: "n1", records: ["e1"], text: "It is a pump." },
]);
const highlightCommentTurn = (id: string, submissionId?: string) => ({
  id,
  role: "system",
  purpose: "dispatch",
  ...(submissionId === undefined ? {} : { submissionId }),
  signal: { tagName: highlightComments.tagName },
  parts: [{ type: "text", text: highlightComments.body }],
});
const highlightFirstTurn = [
  highlightUser("user-1", "The reservoir holds a day of supply.", "sub-1"),
  {
    id: "assistant-1",
    role: "assistant",
    purpose: "assistant",
    submissionId: "sub-1",
    parts: [
      {
        type: "dynamic-tool",
        toolName: brunchTools.ledgerCommit,
        toolCallId: "ledger-1",
        state: "output-available",
        input: {
          entries: [
            [
              "entity/create",
              {
                name: "Reservoir",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        },
        output: {
          status: "recorded",
          commitId: "ledger-1",
          revision: 1,
          ids: ["e1"],
        },
      },
    ],
  },
];
const observedHistory = (
  messages: readonly unknown[],
): AgentConversationObservationSnapshot => ({
  conversation: {
    conversationId: "conversation-highlights",
    settlements: [],
    messages: messages as never,
  },
  offset: `offset-${messages.length}`,
  phase: "live",
  error: undefined,
});
const historyNotYetRead: AgentConversationObservationSnapshot = {
  conversation: undefined,
  offset: undefined,
  phase: "loading",
  error: undefined,
};

/**
 * Brunch's assistant over an observed conversation whose history and
 * admissions the test releases, submitting through the panel transport.
 */
const renderLedgerHighlights = (
  initial: AgentConversationObservationSnapshot,
) => {
  let snapshot = initial;
  const subscribers = new Set<() => void>();
  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };
  const deliveries: {
    readonly admit: (submissionId: string) => void;
    readonly refuse: () => void;
    readonly lose: () => void;
  }[] = [];
  const send = vi.fn(
    (_submission: { readonly idempotencyKey?: string }) =>
      new Promise<AgentSendResult>((resolve, reject) => {
        deliveries.push({
          admit: (submissionId) =>
            resolve({
              submissionId,
              uid: "uid",
              offset: `admitted-${submissionId}`,
              streamUrl: "http://brunch.test/stream",
            }),
          refuse: () => reject(new FlueApiError(403, "Refused")),
          lose: () =>
            reject(new TypeError("Connection lost after request write")),
        });
      }),
  );
  flueClientMock.current = {
    send,
    wait: () => new Promise<never>(() => {}),
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => snapshot,
      // Flue publishes again as it re-reads the history.
      refresh: notify,
      subscribe: (subscriber: () => void) => {
        subscribers.add(subscriber);
        return () => subscribers.delete(subscriber);
      },
    }),
  };

  const rendered = renderAssistant();
  const ledgerTab = () => {
    const content = rendered.assistant().additionalTab?.content;
    if (
      !isValidElement<{ highlightChanges?: boolean; messages: unknown[] }>(
        content,
      )
    )
      throw new Error("Missing Ledger tab");
    return content.props;
  };
  return {
    rendered,
    send,
    ledgerTab,
    highlighted: () => ledgerTab().highlightChanges ?? true,
    /** Observe the next history without rendering it yet. */
    observe: (next: AgentConversationObservationSnapshot) => {
      snapshot = next;
      notify();
    },
    publish: (next: AgentConversationObservationSnapshot) =>
      act(() => {
        snapshot = next;
        notify();
      }),
    /** Send a message, returning once Flue has been asked to admit it. */
    submit: async (id: string, text: string) => {
      const sent = send.mock.calls.length;
      const response = rendered.assistant().transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat",
        messageId: id,
        messages: [{ id, role: "user", parts: [{ type: "text", text }] }],
        abortSignal: undefined,
      });
      const settled = response.then(
        () => "admitted",
        () => "failed",
      );
      await waitFor(() => expect(send).toHaveBeenCalledTimes(sent + 1));
      const delivery = deliveries.at(-1);
      if (delivery === undefined) throw new Error("Missing delivery");
      const release = (settle: () => void, expected: string) =>
        act(async () => {
          settle();
          expect(await settled).toBe(expected);
        });
      return {
        admit: (submissionId: string) =>
          release(() => delivery.admit(submissionId), "admitted"),
        refuse: () => release(delivery.refuse, "failed"),
        lose: () => release(delivery.lose, "failed"),
      };
    },
  };
};

test("a submission clears the Ledger's highlights before admission, until a new canonical turn opens", async () => {
  const { rendered, ledgerTab, highlighted, publish, submit } =
    renderLedgerHighlights(observedHistory(highlightFirstTurn));
  /**
   * The highlights clear while Flue holds the admission, and stay cleared once
   * it refuses.
   */
  const submitRefused = async (id: string, text: string) => {
    const delivery = await submit(id, text);
    expect(highlighted()).toBe(false);
    await delivery.refuse();
    expect(highlighted()).toBe(false);
  };
  await waitFor(() => expect(ledgerTab().messages).toHaveLength(2));
  expect(highlighted()).toBe(true);

  await submitRefused("draft-2", "A pump fills it.");
  // A refresh to the same history still has no new turn.
  publish(observedHistory([...highlightFirstTurn]));
  expect(highlighted()).toBe(false);

  // A comment turn opens canonically, wherever it was sent from.
  const commented = [...highlightFirstTurn, highlightCommentTurn("comments-2")];
  publish(observedHistory(commented));
  expect(highlighted()).toBe(true);

  await submitRefused("draft-3", "And a valve.");
  publish(
    observedHistory([...commented, highlightUser("user-3", "And a valve.")]),
  );
  expect(highlighted()).toBe(true);

  // A replaced conversation does not inherit the dismissal.
  await submitRefused("draft-4", "Start over.");
  act(() => rendered.assistant().onClearMessages?.());
  await waitFor(() => expect(highlighted()).toBe(true));
});

test("delivering the same message again keeps the marks of the turn it opened, while a fresh message clears them", async () => {
  const { ledgerTab, highlighted, publish, submit, send } =
    renderLedgerHighlights(observedHistory(highlightFirstTurn));
  await waitFor(() => expect(ledgerTab().messages).toHaveLength(2));

  const delivery = await submit("comments-2", highlightComments.body);
  expect(highlighted()).toBe(false);
  // Flue admits the comments and the turn they open is observed, but the
  // acknowledgement is lost; the canonical turn has an id of Flue's own.
  const commented = [
    ...highlightFirstTurn,
    highlightCommentTurn("entry_direct_comments", "sub-2"),
  ];
  publish(observedHistory(commented));
  expect(highlighted()).toBe(true);
  await delivery.lose();
  expect(highlighted()).toBe(true);

  // Retry delivers the same message, which Flue answers with its receipt.
  const retried = await submit("comments-2", highlightComments.body);
  expect(highlighted()).toBe(true);
  await retried.admit("sub-2");
  expect(send.mock.calls[1]?.[0].idempotencyKey).toBe(
    send.mock.calls[0]?.[0].idempotencyKey,
  );
  publish(observedHistory([...commented]));
  expect(highlighted()).toBe(true);

  // Retry answer sends a fresh message, which is the user's next turn.
  await submit("retry-answer", "It is a pump.");
  expect(highlighted()).toBe(false);
});

test("a turn observed in the same render as a submission is newer than the turn it moves past", async () => {
  const { rendered, ledgerTab, highlighted, observe, send } =
    renderLedgerHighlights(observedHistory(highlightFirstTurn));
  await waitFor(() => expect(ledgerTab().messages).toHaveLength(2));
  const external = [
    ...highlightFirstTurn,
    highlightUser("entry_direct_other", "And a valve.", "sub-other"),
  ];
  await act(async () => {
    void rendered
      .assistant()
      .transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat",
        messageId: "draft-2",
        messages: [
          {
            id: "draft-2",
            role: "user",
            parts: [{ type: "text", text: "A pump fills it." }],
          },
        ],
        abortSignal: undefined,
      })
      .catch(() => {});
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    // Another tab's turn arrives before React renders the submission.
    observe(observedHistory(external));
  });
  expect(ledgerTab().messages).toHaveLength(3);
  expect(highlighted()).toBe(true);
});

test("a message refused before the history is read leaves the turn the history shows unmarked, but not a later one", async () => {
  const { ledgerTab, highlighted, publish, submit } =
    renderLedgerHighlights(historyNotYetRead);
  const delivery = await submit("draft-2", "A pump fills it.");
  await delivery.refuse();

  publish(observedHistory(highlightFirstTurn));
  expect(ledgerTab().messages).toHaveLength(2);
  expect(highlighted()).toBe(false);
  publish(observedHistory([...highlightFirstTurn]));
  expect(highlighted()).toBe(false);

  // A turn opened afterwards, from any tab, marks its changes.
  publish(
    observedHistory([
      ...highlightFirstTurn,
      highlightUser("entry_direct_other", "And a valve.", "sub-other"),
    ]),
  );
  expect(highlighted()).toBe(true);

  // Accepted limit: nothing orders a refused message against the history, so
  // another tab's turn admitted while the history was still being read is
  // taken for the turn moved past, and stays unmarked until the next turn.
  cleanup();
  const concurrent = renderLedgerHighlights(historyNotYetRead);
  const refused = await concurrent.submit("draft-2", "A pump fills it.");
  await refused.refuse();
  const other = [
    ...highlightFirstTurn,
    highlightUser("entry_direct_other", "And a valve.", "sub-other"),
  ];
  concurrent.publish(observedHistory(other));
  expect(concurrent.highlighted()).toBe(false);
  concurrent.publish(
    observedHistory([
      ...other,
      highlightUser("entry_direct_next", "And a tap.", "sub-next"),
    ]),
  );
  expect(concurrent.highlighted()).toBe(true);
});

test("a message admitted before the history is read, whose acknowledgement is lost, marks its turn once a retry returns Flue's receipt", async () => {
  const { highlighted, publish, submit } =
    renderLedgerHighlights(historyNotYetRead);
  const delivery = await submit("comments-2", highlightComments.body);
  await delivery.lose();
  const commented = observedHistory([
    ...highlightFirstTurn,
    highlightCommentTurn("entry_direct_comments", "sub-2"),
  ]);
  // Accepted limit: without a receipt the turn reads as the one moved past.
  publish(commented);
  expect(highlighted()).toBe(false);

  const retried = await submit("comments-2", highlightComments.body);
  expect(highlighted()).toBe(false);
  await retried.admit("sub-2");
  expect(highlighted()).toBe(true);
});

test.each(["before", "after"] as const)(
  "a fresh message sent while the history is read moves past the turn an earlier one opened, with that one's receipt %s it",
  async (receipt) => {
    const { highlighted, publish, submit } =
      renderLedgerHighlights(historyNotYetRead);
    const first = await submit("draft-a", "A pump fills it.");
    if (receipt === "before") await first.admit("sub-a");
    const next = await submit("draft-b", "And a valve.");
    await next.refuse();
    if (receipt === "after") await first.admit("sub-a");
    publish(
      observedHistory([
        ...highlightFirstTurn,
        highlightUser("entry_direct_a", "A pump fills it.", "sub-a"),
      ]),
    );
    expect(highlighted()).toBe(false);
  },
);

test("a receipt restores the marks only of the turn it opened, not of a turn its settlement follows", async () => {
  const { highlighted, publish, submit } =
    renderLedgerHighlights(historyNotYetRead);
  const delivery = await submit("draft-2", "A pump fills it.");
  await delivery.admit("sub-2");
  publish(
    observedHistory([
      ...highlightFirstTurn,
      {
        id: "entry_submission_interrupted_sub-2",
        role: "system",
        purpose: "advisory",
        submissionId: "sub-2",
        settlement: { outcome: "failed" },
        parts: [{ type: "text", text: "The submission failed." }],
      },
    ]),
  );
  expect(highlighted()).toBe(false);
});

test("a message Flue admits before the history is read marks the turn it opens", async () => {
  const ownTurn = [
    ...highlightFirstTurn,
    highlightUser("entry_direct_two", "A pump fills it.", "sub-2"),
  ];

  // The history was read before the admission; the turn follows live.
  const before = renderLedgerHighlights(historyNotYetRead);
  const first = await before.submit("draft-2", "A pump fills it.");
  before.publish(observedHistory(highlightFirstTurn));
  expect(before.highlighted()).toBe(false);
  await first.admit("sub-2");
  before.publish(observedHistory(ownTurn));
  expect(before.highlighted()).toBe(true);
  cleanup();

  // The history already shows the turn when it is first read.
  const after = renderLedgerHighlights(historyNotYetRead);
  const second = await after.submit("draft-2", "A pump fills it.");
  await second.admit("sub-2");
  after.publish(observedHistory(ownTurn));
  expect(after.ledgerTab().messages).toHaveLength(3);
  expect(after.highlighted()).toBe(true);
  cleanup();

  // The history shows the turn before Flue's acknowledgement arrives.
  const acknowledged = renderLedgerHighlights(historyNotYetRead);
  const third = await acknowledged.submit("draft-2", "A pump fills it.");
  acknowledged.publish(observedHistory(ownTurn));
  await third.admit("sub-2");
  expect(acknowledged.highlighted()).toBe(true);
});

test("a conversation Flue does not have yet is a known, empty history", async () => {
  const { highlighted, publish, submit } = renderLedgerHighlights({
    conversation: undefined,
    offset: undefined,
    phase: "absent",
    error: undefined,
  });
  const delivery = await submit("draft-1", "The reservoir holds a day.");
  await delivery.refuse();
  // The first turn, from another tab, is new to this one.
  publish(observedHistory(highlightFirstTurn));
  expect(highlighted()).toBe(true);
});
