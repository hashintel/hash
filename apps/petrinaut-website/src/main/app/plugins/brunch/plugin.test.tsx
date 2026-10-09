/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent/constants";
import {
  createExperimentToolName,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import {
  createEmptyTestInstance,
  createTestPluginApi,
} from "../_shared/testing/create-test-plugin-api";
import { stubLocalStorage } from "../_shared/testing/stub-local-storage";
import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "./conversation/brunch-conversation-id";
import { brunchPlugin } from "./plugin";
import {
  brunchPetrinautClientToolNames,
  canonicalPetrinautClientToolNames,
} from "./tools/brunch-client-tools";

import type { AssistantChatProps } from "../_shared/chat/assistant-chat";
import type { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import type { BrunchService, createBrunchPlugin } from "./definition";
import type { AgentConversationObservationSnapshot } from "@flue/sdk";
import type { Petrinaut } from "@hashintel/petrinaut-core";
import type {
  PluginApi,
  PluginAssistantTab,
  PluginHook,
} from "@hashintel/petrinaut/ui";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const netId = toPetrinautId("net-1");

const flueClientMock = vi.hoisted(() => ({ current: null as unknown }));
const flueClientOptions = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@flue/sdk", () => ({
  createFlueClient: (options: unknown) => {
    flueClientOptions.current = options;
    return flueClientMock.current;
  },
}));
vi.mock("./brunch-preview-config", () => ({
  brunchPreviewConfig: {
    chatEndpoint: "/agents/chat",
    isBrunchConfigured: true,
  },
}));
vi.mock("./conversation/brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));
// The probe reads the view's props and never renders it; Voice's tests render it.
vi.mock("./plugin/brunch-chat", () => ({ BrunchChat: () => null }));
const transports = vi.hoisted(() => ({
  options: null as unknown,
  sessions: [] as {
    readonly client: unknown;
    readonly tracker: BrunchPanelConversationTracker;
  }[],
}));
vi.mock("./brunch-panel-transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./brunch-panel-transport")>();
  return {
    ...actual,
    createBrunchPanelTransport: (
      ...args: Parameters<typeof actual.createBrunchPanelTransport>
    ) => {
      const [client, tracker, options] = args;
      transports.options = options;
      transports.sessions.push({ client, tracker });
      return actual.createBrunchPanelTransport(...args);
    },
  };
});
const coordinators = vi.hoisted(
  () =>
    [] as {
      close: () => void;
      hasPending: (toolCallId: string) => boolean;
    }[],
);
vi.mock("./tools/brunch-mutation-approval", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./tools/brunch-mutation-approval")>();
  return {
    ...actual,
    createBrunchMutationApprovalCoordinator: () => {
      const coordinator = actual.createBrunchMutationApprovalCoordinator();
      vi.spyOn(coordinator, "close");
      coordinators.push(coordinator);
      return coordinator;
    },
  };
});

/** What the editor last received from the Brunch plugin's hook. */
const rendered = {
  chat: null as AssistantChatProps | null,
  tabs: [] as readonly PluginAssistantTab[],
  service: undefined as BrunchService | undefined,
};

type ProbeApi = PluginApi<typeof createBrunchPlugin>;

/** Runs the plugin's hook as the editor does and records what it returns. */
const BrunchProbe = ({ api }: { api: ProbeApi }) => {
  const useBrunchPlugin = brunchPlugin.hook as PluginHook<
    typeof createBrunchPlugin
  >;
  const { assistant, provides } = useBrunchPlugin(api);
  rendered.chat = isValidElement<AssistantChatProps>(assistant.view)
    ? assistant.view.props
    : null;
  rendered.tabs = assistant.tabs ?? [];
  rendered.service = provides;
  return null;
};

/** Renders Brunch over `instance`, shown as the editor's assistant unless `isActive` is false. */
const renderBrunch = ({
  instance = createEmptyTestInstance(netId),
  isActive = true,
}: { instance?: Petrinaut; isActive?: boolean } = {}) => {
  const api = createTestPluginApi(instance, { title: "Queue" });
  const apiFor = (shown: boolean): ProbeApi => ({
    ...api,
    assistant: { isActive: shown },
  });
  const view = render(<BrunchProbe api={apiFor(isActive)} />);
  return {
    ...view,
    api,
    instance,
    show: (shown: boolean) =>
      view.rerender(<BrunchProbe api={apiFor(shown)} />),
  };
};

const currentChat = (): AssistantChatProps => {
  if (rendered.chat === null) throw new Error("Brunch has no chat yet.");
  return rendered.chat;
};

const observing = (snapshot: () => unknown) => ({
  observe: () => ({
    close: vi.fn(),
    getSnapshot: snapshot,
    refresh: vi.fn(),
    subscribe: () => () => undefined,
  }),
});

const absentHistory = () => ({
  history: async () => ({
    conversation: {
      conversationId: ordinaryConstructionConversationIdFrom(netId),
      settlements: [],
      messages: [],
    },
    offset: "offset-0",
  }),
  ...observing(() => ({ phase: "absent" })),
});

const placeInput = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
  targetSubnetId: null,
};

const executeTool = (toolName: string, toolCallId: string, input: unknown) => {
  const tool = currentChat().automaticTools?.find(
    (candidate) => candidate.toolName === toolName,
  );
  if (tool === undefined) throw new Error(`No ${toolName} tool`);
  return tool.execute({
    input,
    toolCallId,
    signal: new AbortController().signal,
  });
};

/**
 * Starts the in-band `removePlace` call `remove-1` on the current chat; the
 * agent serves its claim and records what the browser posts back.
 */
const startRemovePlace = () => {
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
  const execute = vi.fn(async () => ({ applied: true }));
  const run = currentChat().inBandBrowserTools?.run(
    {
      toolCallId: "remove-1",
      toolName: "removePlace",
      input: { placeId: toPetrinautId("queue") },
      signal: new AbortController().signal,
    },
    execute,
  );
  return { posted, claimed, execute, run };
};

/** Edits that apply without changing the net, so the tools report it unchanged. */
const stubEdits = ({ document }: ReturnType<typeof createTestPluginApi>) => {
  for (const name of ["addPlace", "addTransition", "addArc"] as const) {
    vi.spyOn(document.edit, name).mockReturnValue({
      applied: true,
      value: undefined,
    });
  }
};

beforeEach(() => {
  stubLocalStorage();
  rendered.chat = null;
  rendered.tabs = [];
  rendered.service = undefined;
  transports.sessions = [];
  flueClientOptions.current = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Brunch's chat", () => {
  test("gives the chat Brunch's tools and presentation, and closes its approvals on unmount", () => {
    flueClientMock.current = absentHistory();
    const view = renderBrunch();
    const chat = currentChat();

    expect(chat.requestStop).toBeTypeOf("function");
    expect(chat.presentation).toBe("brunch");
    expect(chat.primaryLabel).toBe("Chat");
    expect(chat.workingLabel).toBe("Working…");
    expect(
      chat.resolveToolPresentation?.({
        toolName: "layout_petrinaut_net",
        state: "success",
        input: {},
        output: {},
        error: undefined,
      }),
    ).toBeUndefined();
    expect(chat.interactiveTools?.map(({ toolName }) => toolName)).toEqual(
      expect.arrayContaining([
        brunchTools.draftPetrinautExperiment,
        "removePlace",
      ]),
    );
    expect(
      chat.interactiveTools?.some(({ toolName }) => toolName === "brunch_ask"),
    ).toBe(false);
    expect(chat.automaticTools?.map(({ toolName }) => toolName)).toEqual([
      "getLatestNetDefinition",
      "getNetCompilationErrors",
      "addPlace",
      "addTransition",
      "addArc",
    ]);

    const coordinator = coordinators.at(-1);
    expect(coordinator).toBeDefined();
    view.unmount();
    expect(coordinator?.close).toHaveBeenCalledOnce();
  });

  test("binds the chat to the document with canonical overrides and the complete static catalogue", () => {
    flueClientMock.current = absentHistory();
    renderBrunch();
    const chat = currentChat();
    const transportOptions = transports.options as {
      readonly initialData?: { readonly binding?: unknown };
      readonly clientToolNames?: ReadonlySet<string>;
      readonly dynamicClientToolNames?: ReadonlySet<string>;
      readonly mapClientToolInput?: unknown;
    };
    const conversationId = brunchEvaluationConversationIdFrom(
      ordinaryConstructionConversationIdFrom(netId),
    );

    expect(chat.conversationId).toBe(conversationId);
    expect(rendered.tabs[0]?.label).toBe("Ledger");
    expect(transportOptions.initialData?.binding).toEqual({
      conversationId,
      documentId: netId,
      incarnationId: netId,
    });
    expect([...(transportOptions.clientToolNames ?? [])].toSorted()).toEqual(
      [...brunchPetrinautClientToolNames].toSorted(),
    );
    expect(transportOptions.mapClientToolInput).toEqual(expect.any(Function));
    // Every configured Brunch browser tool, the draft included, settles in band.
    expect(chat.inBandBrowserTools?.has(createExperimentToolName)).toBe(true);
    expect(
      chat.inBandBrowserTools?.has(brunchTools.draftPetrinautExperiment),
    ).toBe(false);
    expect(
      [...(transportOptions.dynamicClientToolNames ?? [])].toSorted(),
    ).toEqual(
      [
        ...canonicalPetrinautClientToolNames,
        brunchTools.draftPetrinautExperiment,
      ].toSorted(),
    );
    expect(rendered.service?.conversation?.conversationId).toBe(conversationId);
  });

  test("mounts nothing of Brunch while another assistant is shown", () => {
    const observe = vi.fn();
    const history = vi.fn();
    flueClientMock.current = { history, observe };
    const view = renderBrunch({ isActive: false });

    expect(rendered.chat).toBeNull();
    expect(rendered.tabs).toEqual([]);
    expect(rendered.service).toEqual({ conversation: null });
    expect(flueClientOptions.current).toBeNull();

    flueClientMock.current = absentHistory();
    view.show(true);
    expect(currentChat().requestStop).toBeTypeOf("function");
    const coordinator = coordinators.at(-1);

    view.show(false);
    expect(rendered.chat).toBeNull();
    expect(rendered.tabs).toEqual([]);
    expect(coordinator?.close).toHaveBeenCalledOnce();
    expect(history).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  test("waits for a durable offset before baselining present Ledger history", async () => {
    flueClientMock.current = observing(() => ({
      conversation: {
        conversationId: "present-without-offset",
        settlements: [],
        messages: [],
      },
      offset: undefined,
      phase: "live",
      error: undefined,
    }));
    renderBrunch();

    await waitFor(() => expect(rendered.tabs[0]?.label).toBe("Ledger"));
    expect(rendered.tabs[0]?.activityIdentities).toBeUndefined();
  });

  test("Stop aborts the bound Flue conversation", async () => {
    let snapshot: AgentConversationObservationSnapshot = {
      conversation: {
        conversationId: "conversation-stop",
        settlements: [],
        messages: [],
      },
      offset: "offset-before-stop",
      phase: "live",
      error: undefined,
    };
    const listeners = new Set<() => void>();
    const abort = vi.fn(async () => {
      snapshot = {
        conversation: {
          conversationId: "conversation-stop",
          settlements: [
            { submissionId: "submission-stop", outcome: "aborted" },
          ],
          messages: [],
        },
        offset: "offset-after-stop",
        phase: "live",
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
    renderBrunch();

    await expect(currentChat().requestStop?.()).resolves.toBe("stop-requested");
    expect(abort).toHaveBeenCalledOnce();
  });

  test("clearing starts a persisted fresh conversation without replacing the model", () => {
    flueClientMock.current = absentHistory();
    const first = renderBrunch();
    const before = currentChat();

    expect(before.canClearMessages).toBe(true);
    act(() => before.onClearMessages?.());
    const after = currentChat();
    expect(after.conversationId).not.toBe(before.conversationId);
    expect(after.conversationId).toContain(
      `${ordinaryConstructionConversationIdFrom(netId)}:`,
    );
    expect(after.automaticTools).not.toBe(before.automaticTools);

    first.unmount();
    renderBrunch({ instance: first.instance });
    expect(currentChat().conversationId).toBe(after.conversationId);
  });

  test("keeps one session while the net changes, and opens another for another document", () => {
    flueClientMock.current = absentHistory();
    const first = renderBrunch();
    const uniqueSessions = () => [
      ...new Map(
        transports.sessions.map((session) => [session.client, session]),
      ).values(),
    ];
    act(() => {
      first.api.document.edit.addPlace(placeInput);
    });
    expect(first.instance.definition.get().places).toHaveLength(1);
    expect(uniqueSessions()).toHaveLength(1);

    first.unmount();
    flueClientMock.current = absentHistory();
    renderBrunch({ instance: createEmptyTestInstance(toPetrinautId("net-2")) });
    const [firstSession, secondSession] = uniqueSessions();
    expect(secondSession?.client).not.toBe(firstSession?.client);
    expect(secondSession?.tracker).not.toBe(firstSession?.tracker);
  });

  test("renews the interactive-tool list when a destructive edit starts waiting for approval", async () => {
    flueClientMock.current = {
      url: "http://brunch.local/agents/chat/instance",
      ...absentHistory(),
    };
    const view = renderBrunch();
    // The ready baseline renews the list once; after it, only approvals do.
    await waitFor(() =>
      expect(() =>
        executeTool("getLatestNetDefinition", "ready-read", {}),
      ).not.toThrow(),
    );
    const readyTools = currentChat().interactiveTools;
    const { run } = startRemovePlace();

    await waitFor(() => {
      expect(coordinators.at(-1)?.hasPending("remove-1")).toBe(true);
      expect(currentChat().interactiveTools).not.toBe(readyTools);
    });
    view.unmount();
    await run;
  });

  test("a destructive edit waiting for approval settles when the conversation is replaced", async () => {
    flueClientMock.current = {
      url: "http://brunch.local/agents/chat/instance",
      ...absentHistory(),
    };
    renderBrunch();
    const chat = currentChat();
    const { posted, claimed, execute, run } = startRemovePlace();
    await waitFor(() => expect(claimed).toHaveBeenCalled());
    await waitFor(() =>
      expect(currentChat().interactiveTools).not.toBe(chat.interactiveTools),
    );
    const waitingTools = currentChat().interactiveTools;
    act(() => chat.onClearMessages?.());

    await run;
    expect(currentChat().interactiveTools).not.toBe(waitingTools);
    expect(execute).not.toHaveBeenCalled();
    expect(posted).toEqual([
      expect.objectContaining({
        output: {
          applied: false,
          reason: "The destructive edit was stopped before approval.",
        },
      }),
    ]);
  });
});

describe("Brunch's canonical replay", () => {
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
    const { api, instance } = renderBrunch();
    stubEdits(api);
    await waitFor(() => expect(currentChat().requestStop).toBeDefined());
    const initialTools = currentChat().automaticTools;
    const canonicalInput = { ...placeInput, id: "canonical-live" };
    const conversationId = currentChat().conversationId ?? "";
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
                toolName: "query_workpiece",
                toolCallId: "ledger-query",
                state: "output-available",
                input: {},
                output: {
                  binding: {
                    conversationId,
                    documentId: netId,
                    incarnationId: netId,
                  },
                  currentWorkpiece: {
                    revisionId: "ledger-revision",
                    sha256:
                      "8c954ded63ba039cfdeb901d054e300ceb9314e4a16cd1d7a5e413c0d59c1e87",
                    ordinal: 1,
                    markdown: "# Ledger",
                  },
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
      (transports.options as { onAdmission?: () => void }).onAdmission?.();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    for (const initialTool of initialTools ?? []) {
      expect(
        currentChat().automaticTools?.find(
          ({ toolName }) => toolName === initialTool.toolName,
        ),
      ).toBe(initialTool);
    }
    const readOutput = executeTool("getLatestNetDefinition", "live-read", {});
    expect(readOutput).toHaveProperty("definition");
    const canonicalOutput = (await executeTool(
      "addPlace",
      "live-mutation",
      canonicalInput,
    )) as { applied?: boolean } | undefined;
    expect(canonicalOutput?.applied).toBe(false);
    expect(instance.definition.get().places).toHaveLength(0);

    const toolsAfterCalls = currentChat().automaticTools;
    snapshot = { ...snapshot, offset: "terminal-offset" };
    act(() => refresh());
    for (const retainedTool of toolsAfterCalls ?? []) {
      expect(
        currentChat().automaticTools?.find(
          ({ toolName }) => toolName === retainedTool.toolName,
        ),
      ).toBe(retainedTool);
    }
    expect(executeTool("getLatestNetDefinition", "live-read", {})).toEqual(
      readOutput,
    );
    expect(executeTool("addPlace", "live-mutation", canonicalInput)).toEqual(
      canonicalOutput,
    );
  });

  test("does not execute a canonical write while history is loading", () => {
    flueClientMock.current = observing(() => ({ phase: "loading" }));
    const { instance } = renderBrunch();

    expect(() =>
      executeTool("getLatestNetDefinition", "loading-read", {}),
    ).toThrow("Conversation history is not ready");
    expect(() => executeTool("addPlace", "loading-place", placeInput)).toThrow(
      "Conversation history is not ready",
    );
    expect(instance.definition.get().places).toEqual([]);
  });

  test("a pending bound mutation in history is not executed again after reload", async () => {
    const pendingPlace = { ...placeInput, id: "pending" };
    flueClientMock.current = observing(() => ({
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
    }));
    const { instance } = renderBrunch();

    await waitFor(() =>
      expect(() =>
        executeTool("addPlace", "pending-mutation", pendingPlace),
      ).toThrow(/already attempted/u),
    );
    expect(instance.definition.get().places).toEqual([]);
  });
});
