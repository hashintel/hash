/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { isValidElement, type ComponentProps, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";
import { brunchTools } from "@hashintel/brunch-agent/constants";
import { createExperimentToolName } from "@hashintel/petrinaut-core";
import { defaultPetrinautNavigationHistoryPolicy } from "@hashintel/petrinaut/react";

import { BrunchPanelConversationTracker } from "../plugins/_shared/brunch-panel-transport";
import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "../plugins/brunch/conversation/brunch-conversation-id";
import { requestFlueStop } from "../plugins/brunch/plugin/use-brunch-plugin";
import {
  canonicalPetrinautClientToolNames,
  brunchPetrinautClientToolNames,
} from "../plugins/brunch/tools/brunch-client-tools";
import { petrinautAiChatEndpoint } from "../plugins/petrinaut-ai/plugin";
import { getBrunchVoiceMode } from "../plugins/voice/brunch-voice-mode";
import { OpenAIRealtimeSession } from "../plugins/voice/realtime/openai-realtime-session";
import { VoiceInterviewControl } from "../plugins/voice/session/voice-interview-control";
import { resolveDefaultAssistant } from "./default-assistant";
import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type {
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";
import type {
  MinimalNetMetadata,
  PetrinautDocHandle,
} from "@hashintel/petrinaut-core";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";
import type {
  Petrinaut,
  PetrinautAiAssistant,
  PetrinautAiMessage,
  PetrinautPluginContribution,
  PetrinautResolvedAssistantTab,
} from "@hashintel/petrinaut/ui";

// The real editor module is kept for its plugin runtime; its chart library
// reads `matchMedia` on import, which jsdom lacks.
await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const defaultTransportOptions = vi.hoisted(() => ({
  current: null as unknown,
}));
const brunchPanelTransportOptions = vi.hoisted(() => ({
  current: null as unknown,
}));
const brunchPanelTransportTracker = vi.hoisted(() => ({
  current: null as BrunchPanelConversationTracker | null,
}));
const brunchPanelTransportSessions = vi.hoisted(() => ({
  current: [] as {
    readonly client: unknown;
    readonly tracker: BrunchPanelConversationTracker;
  }[],
}));
const flueClientMock = vi.hoisted(() => ({ current: null as unknown }));
const flueClientOptions = vi.hoisted(() => ({ current: null as unknown }));
/** What the active assistant plugin returns, as the fake editor last saw it. */
const renderedPetrinaut = vi.hoisted(() => ({
  aiAssistant: null as PetrinautAiAssistant | null,
  tabs: [] as readonly PetrinautResolvedAssistantTab[],
}));
const renderedAssistants = vi.hoisted(() => [] as PetrinautAiAssistant[]);
const installedPlugins = vi.hoisted(() => ({
  current: [] as readonly PetrinautPluginContribution[],
}));
/** Petrinaut's user-settings setter for the assistant choice, captured by the fake editor. */
const assistantChoice = vi.hoisted(() => ({
  choose: null as ((pluginId: string | null) => void) | null,
}));
const mutationApprovalCoordinators = vi.hoisted(
  () => [] as { close: () => void }[],
);
vi.mock("@flue/sdk", () => ({
  createFlueClient: (options: unknown) => {
    flueClientOptions.current = options;

    return flueClientMock.current;
  },
}));

const brunchPreviewConfig = vi.hoisted(() => ({
  chatEndpoint: "/agents/chat",
  isBrunchConfigured: true,
}));
vi.mock("../plugins/brunch/brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => brunchPreviewConfig,
}));

vi.mock(
  "../plugins/brunch/tools/brunch-mutation-approval",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../plugins/brunch/tools/brunch-mutation-approval")
      >();

    return {
      ...actual,
      createBrunchMutationApprovalCoordinator: () => {
        const coordinator = actual.createBrunchMutationApprovalCoordinator();
        vi.spyOn(coordinator, "close");
        mutationApprovalCoordinators.push(coordinator);

        return coordinator;
      },
    };
  },
);

const editorProps = vi.hoisted(() => ({
  current: null as ComponentProps<typeof Petrinaut> | null,
}));

vi.mock("../plugins/brunch/conversation/brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));
vi.mock("../plugins/_shared/brunch-panel-transport", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../plugins/_shared/brunch-panel-transport")
    >();

  return {
    ...actual,
    createBrunchPanelTransport: (
      client: Parameters<typeof actual.createBrunchPanelTransport>[0],
      tracker: Parameters<typeof actual.createBrunchPanelTransport>[1],
      options?: Parameters<typeof actual.createBrunchPanelTransport>[2],
    ) => {
      brunchPanelTransportOptions.current = options;
      brunchPanelTransportTracker.current = tracker;
      brunchPanelTransportSessions.current.push({ client, tracker });

      return actual.createBrunchPanelTransport(client, tracker, options);
    },
  };
});

/**
 * Only the editor is faked. Plugins run through the real
 * `PetrinautPluginsProvider`, mounted as the real editor mounts it, and the
 * fake editor records what the active assistant returns where the tests read
 * it.
 */
vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut/ui")>();
  const { Fragment, use, useLayoutEffect } = await import("react");
  const { CommandRegistryProvider, UserSettingsContext, UserSettingsProvider } =
    await import("@hashintel/petrinaut/react");
  const emptyTabs: readonly PetrinautResolvedAssistantTab[] = [];
  const FakeEditor = ({
    props,
  }: {
    props: ComponentProps<typeof actual.Petrinaut>;
  }) => {
    const plugins = actual.usePetrinautPlugins();
    const active = actual.usePetrinautActiveAssistant();
    const { setAiAssistantId } = use(UserSettingsContext);
    const chat = active?.chat ?? null;
    const tabs = active?.tabs ?? emptyTabs;

    // Recorded after every commit, where the tests read them.
    useLayoutEffect(() => {
      editorProps.current = props;
      installedPlugins.current = plugins;
      assistantChoice.choose = setAiAssistantId;
      renderedPetrinaut.aiAssistant = chat;
      renderedPetrinaut.tabs = tabs;
      if (chat !== null) renderedAssistants.push(chat);
    });
    // A remount must publish afresh; nothing recorded outlives the editor.
    useLayoutEffect(
      () => () => {
        renderedPetrinaut.aiAssistant = null;
        renderedPetrinaut.tabs = [];
      },
      [],
    );

    // The real editor renders every plugin's root inside itself (the palette).
    return plugins.map(({ manifest, providers }) => (
      <Fragment key={manifest.id}>{providers.root}</Fragment>
    ));
  };
  const Petrinaut = (props: ComponentProps<typeof actual.Petrinaut>) => {
    const { handle, plugins = [] } = props;

    // The real editor owns a command registry when the host shares none.
    return (
      <CommandRegistryProvider>
        <UserSettingsProvider>
          <actual.PetrinautPluginsProvider
            plugins={plugins}
            document={{ id: handle.id, handle }}
          >
            <FakeEditor props={props} />
          </actual.PetrinautPluginsProvider>
        </UserSettingsProvider>
      </CommandRegistryProvider>
    );
  };

  return {
    ...actual,
    DefaultChatTransport: class {
      public constructor(options: unknown) {
        defaultTransportOptions.current = options;
      }
    },
    Petrinaut,
    WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
    definePetrinautAiInteractiveTool: (definition: unknown) => definition,
    executePetrinautAiMutation: () => ({
      applied: false,
      reason: "Mocked document unchanged.",
    }),
  };
});

/** The chat the active assistant has published; throws until one has. */
const currentAssistant = (): PetrinautAiAssistant => {
  const assistant = renderedPetrinaut.aiAssistant;
  if (assistant === null) {
    throw new Error("No assistant has published a chat yet.");
  }

  return assistant;
};

const forgetRenderedAssistant = () => {
  renderedPetrinaut.aiAssistant = null;
  renderedPetrinaut.tabs = [];
  renderedAssistants.length = 0;
  installedPlugins.current = [];
  assistantChoice.choose = null;
};

/** Petrinaut's user settings, where the assistant choice lives. */
const userSettingsStorageKey = "petrinaut:user-settings";
type AssistantPluginId = "website.brunch" | "website.petrinaut-ai";
const chooseAssistant = (pluginId: AssistantPluginId) =>
  localStorage.setItem(
    userSettingsStorageKey,
    JSON.stringify({ aiAssistantId: pluginId }),
  );
const storedAssistantChoice = (): string | null | undefined =>
  (
    JSON.parse(localStorage.getItem(userSettingsStorageKey) ?? "{}") as {
      aiAssistantId?: string | null;
    }
  ).aiAssistantId;
/** Switches assistants the way the settings dialog and the palette commands do. */
const switchAssistant = (pluginId: AssistantPluginId) => {
  const choose = assistantChoice.choose;
  if (choose === null) throw new Error("The editor has not mounted.");
  act(() => choose(pluginId));
};

/** The Voice plugin's flags, persisted by Petrinaut under the plugin's key. */
const voiceFlagsStorageKey = "petrinaut:plugin:website.voice";
type VoiceFlags = { voice?: boolean; realtime?: boolean };
const seedVoiceFlags = (flags: VoiceFlags) =>
  localStorage.setItem(voiceFlagsStorageKey, JSON.stringify(flags));
const storedVoiceFlags = (): VoiceFlags =>
  JSON.parse(localStorage.getItem(voiceFlagsStorageKey) ?? "{}") as VoiceFlags;
/** Flips a Voice flag the way the Labs rows do: through the plugin's settings. */
const setVoiceFlag = (key: keyof VoiceFlags, value: boolean) => {
  const voice = installedPlugins.current.find(
    ({ manifest }) => manifest.id === "website.voice",
  );
  if (!voice) throw new Error("The Voice plugin is not installed.");
  act(() => voice.settings.set(key, value));
};
const installedPluginIds = () =>
  installedPlugins.current.map(({ manifest }) => manifest.id);

/**
 * Node supplies its own `localStorage` global that shadows the jsdom one and
 * carries no `setItem`, so the demo's storage hooks cannot read a seed from
 * it. An in-memory store gives them one.
 */
const stubStorage = () => {
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
};

/**
 * The `storage` event another tab's write raises. Built by hand because the
 * stubbed store is not a jsdom `Storage`, which `StorageEvent` insists on.
 */
const otherTabStorageEvent = (key: string): Event =>
  Object.defineProperties(new Event("storage"), {
    key: { value: key },
    storageArea: { value: localStorage },
  });

const storedNet = (params: {
  id: string;
  incarnationId?: string;
  lastUpdated: string;
  revisionId?: string;
  title: string;
}) => ({
  id: params.id,
  title: params.title,
  lastUpdated: params.lastUpdated,
  ...(params.incarnationId === undefined
    ? {}
    : { incarnationId: params.incarnationId }),
  ...(params.revisionId === undefined ? {} : { revisionId: params.revisionId }),
  sdcpn: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
});

const seedStoredNet = (incarnationId?: string, revisionId?: string) => {
  stubStorage();
  localStorage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      "net-1": storedNet({
        id: "net-1",
        incarnationId,
        lastUpdated: "2020-01-01T00:00:00.000Z",
        revisionId,
        title: "Seeded net",
      }),
    }),
  );
};

describe("local storage demo Brunch voice integration", () => {
  afterEach(forgetRenderedAssistant);

  test("does not install voice on the generic local chat fallback", () => {
    expect(getBrunchVoiceMode(null)).toBeUndefined();
  });

  test("installs the app-owned voice control for a configured Brunch transport", async () => {
    const config = { available: true as const, connectionTimeoutMs: 15_000 };
    const tracker = new BrunchPanelConversationTracker();
    const snapshot = {
      conversationId: "petrinaut-preview:net-1",
      messages: [],
      settlements: [],
    };
    const voiceMode = getBrunchVoiceMode(
      config,
      tracker,
      snapshot.settlements,
      snapshot,
    );
    const renderControl = () =>
      voiceMode?.({
        canAcceptVoiceInput: true,
        conversationId: "petrinaut-preview:net-1",
        inputMode: "text",
        isAiAssistantOpen: true,
        messages: [],
        registerVoiceModeControls: vi.fn(() => () => undefined),
        reportVoiceSessionState: vi.fn(),
        setInputMode: vi.fn(),
        setVoiceActive: vi.fn(),
        status: "ready",
        stop: vi.fn(async () => undefined),
        submitText: vi.fn(async () => ({
          kind: "message" as const,
          messageId: "message-1",
        })),
        submitVoiceInput: vi.fn(async () => ({
          kind: "message" as const,
          messageId: "voice-message-1",
        })),
      });
    const control = renderControl();

    expect(isValidElement(control)).toBe(true);
    if (!isValidElement(control)) {
      throw new Error("Expected the configured composer control to render.");
    }
    expect(control.props).toHaveProperty("snapshot", snapshot);
    let finishSubmission = () => {};
    const pending = tracker.trackSubmission(
      new Promise<void>((resolve) => {
        finishSubmission = resolve;
      }),
    );
    const whilePending = renderControl();
    expect(isValidElement(whilePending) && whilePending.props).toHaveProperty(
      "snapshot",
      snapshot,
    );
    finishSubmission();
    await pending;
    const failureListener = vi.fn();
    const responseCompletedListener = vi.fn();
    const responseStartedListener = vi.fn();
    const stopListener = vi.fn();
    const target = { kind: "user" as const, messageId: "voice-turn-1" };
    const controlProps = control.props as {
      config: typeof config;
      resolveInputSubmission: (messageId: string) => string | undefined;
      resolveResponseSubmission: (
        messageId: string,
      ) => readonly string[] | undefined;
      subscribeToAdmission: (
        admissionTarget: typeof target,
        listener: (submissionId: string) => void,
      ) => () => void;
      subscribeToAdmissionFailure: (
        admissionTarget: typeof target,
        listener: (error: FlueChatAdmissionError) => void,
      ) => () => void;
      subscribeToResponseMessageCompleted: (
        listener: typeof responseCompletedListener,
      ) => () => void;
      subscribeToResponseMessageStarted: (
        listener: typeof responseStartedListener,
      ) => () => void;
      subscribeToStopRequested: (listener: () => void) => () => void;
    };
    expect(control.type).toBe(VoiceInterviewControl);
    expect(controlProps.config).toBe(config);

    const rerenderedControl = renderControl();
    expect(isValidElement(rerenderedControl)).toBe(true);
    if (!isValidElement(rerenderedControl)) {
      throw new Error("Expected the configured composer control to rerender.");
    }
    const rerenderedControlProps =
      rerenderedControl.props as typeof controlProps;
    expect(rerenderedControlProps.resolveInputSubmission).toBe(
      controlProps.resolveInputSubmission,
    );
    expect(rerenderedControlProps.resolveResponseSubmission).toBe(
      controlProps.resolveResponseSubmission,
    );
    expect(rerenderedControlProps.subscribeToAdmission).toBe(
      controlProps.subscribeToAdmission,
    );
    expect(rerenderedControlProps.subscribeToAdmissionFailure).toBe(
      controlProps.subscribeToAdmissionFailure,
    );
    expect(rerenderedControlProps.subscribeToResponseMessageCompleted).toBe(
      controlProps.subscribeToResponseMessageCompleted,
    );
    expect(rerenderedControlProps.subscribeToResponseMessageStarted).toBe(
      controlProps.subscribeToResponseMessageStarted,
    );
    expect(rerenderedControlProps.subscribeToStopRequested).toBe(
      controlProps.subscribeToStopRequested,
    );

    const unsubscribe = controlProps.subscribeToAdmissionFailure(
      target,
      failureListener,
    );
    const unsubscribeFromStop =
      controlProps.subscribeToStopRequested(stopListener);
    const unsubscribeFromResponseCompleted =
      controlProps.subscribeToResponseMessageCompleted(
        responseCompletedListener,
      );
    const unsubscribeFromResponseStarted =
      controlProps.subscribeToResponseMessageStarted(responseStartedListener);
    const admissionError = new FlueChatAdmissionError({ kind: "ambiguous" });

    tracker.recordAdmissionFailure(target, admissionError);
    tracker.recordResponse({
      messageId: "assistant-1",
      position: { batch: 1, index: 0 },
      submissionId: "submission-1",
    });
    tracker.recordResponseMessageCompleted({
      messageId: "assistant-1",
      position: { batch: 1, index: 1 },
      submissionId: "submission-1",
    });
    tracker.recordStopRequested();

    expect(failureListener).toHaveBeenCalledWith(admissionError);
    expect(responseStartedListener).toHaveBeenCalledOnce();
    expect(responseCompletedListener).toHaveBeenCalledOnce();
    expect(stopListener).toHaveBeenCalledOnce();
    unsubscribe();
    unsubscribeFromResponseCompleted();
    unsubscribeFromResponseStarted();
    unsubscribeFromStop();
  });

  test("registers no brunch_ask tool in the production Brunch preview", async () => {
    stubStorage();
    chooseAssistant("website.brunch");
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

    const rendered = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(renderedPetrinaut.aiAssistant).not.toBeNull());
    const aiAssistant = currentAssistant();

    expect(aiAssistant.requestStop).toBeTypeOf("function");
    expect(aiAssistant.executeMutation).toBeUndefined();
    expect(
      aiAssistant.interactiveTools?.map(({ toolName }) => toolName),
    ).toEqual(
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
    expect(aiAssistant.automaticTools?.map(({ toolName }) => toolName)).toEqual(
      [
        "getLatestNetDefinition",
        "getNetCompilationErrors",
        "addPlace",
        "addTransition",
        "addArc",
      ],
    );

    const mutationApprovalCoordinator = mutationApprovalCoordinators.at(-1);
    expect(mutationApprovalCoordinator).toBeDefined();
    rendered.unmount();
    expect(mutationApprovalCoordinator?.close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  test("waits for a durable offset before baselining present Ledger history", async () => {
    stubStorage();
    chooseAssistant("website.brunch");
    // A settled browser call that moved the document: one Ledger entry.
    const settledActivity = (toolCallId: string) => ({
      role: "assistant",
      purpose: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "addPlace",
          toolCallId,
          state: "output-available",
          input: {},
          output: {
            brunchBrowserResult: true,
            output: { applied: true },
            metadata: {
              documentRevision: {
                before: `${toolCallId}-before`,
                after: toolCallId,
              },
            },
          },
        },
      ],
    });
    let snapshot: AgentConversationObservationSnapshot = {
      conversation: {
        conversationId: "present-without-offset",
        settlements: [],
        messages: [settledActivity("settled-before-open")] as never,
      },
      offset: undefined,
      phase: "live",
      error: undefined,
    };
    const subscribers = new Set<() => void>();
    const publish = (next: AgentConversationObservationSnapshot) => {
      snapshot = next;
      act(() => {
        for (const subscriber of subscribers) subscriber();
      });
    };
    flueClientMock.current = {
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => snapshot,
        refresh: vi.fn(),
        subscribe: (subscriber: () => void) => {
          subscribers.add(subscriber);

          return () => subscribers.delete(subscriber);
        },
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ available: false }),
      ),
    );

    const rendered = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(renderedPetrinaut.aiAssistant).not.toBeNull());
    // Petrinaut counts the identities that appear after the first collection
    // it sees and badges the tab with them (its `tab-attention` tests pin the
    // counting); the plugin reports the identities.
    const ledgerActivity = () =>
      renderedPetrinaut.tabs.find(({ id }) => id === "ledger")
        ?.activityIdentities;
    // The Ledger is listed, but reports no activity while the history has no
    // durable offset, so nothing can be counted.
    expect(ledgerActivity()).toBeUndefined();

    // The first durable history reports its entry, which becomes the baseline.
    publish({ ...snapshot, offset: "durable-1" });
    expect(ledgerActivity()).toHaveLength(1);

    // An entry settled after that is reported beside it.
    publish({
      ...snapshot,
      conversation: {
        ...snapshot.conversation!,
        messages: [
          settledActivity("settled-before-open"),
          settledActivity("settled-after-open"),
        ] as never,
      },
      offset: "durable-2",
    });
    await waitFor(() => expect(ledgerActivity()).toHaveLength(2));

    rendered.unmount();
    vi.unstubAllGlobals();
  });

  test("keeps durable Flue Stop distinct from local playback cancellation", async () => {
    stubStorage();
    chooseAssistant("website.brunch");
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

    const rendered = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() =>
      expect(renderedPetrinaut.aiAssistant?.requestStop).toBeTypeOf("function"),
    );
    const aiAssistant = currentAssistant();

    await expect(aiAssistant.requestStop?.()).resolves.toBe("stop-requested");
    expect(abort).toHaveBeenCalledOnce();
    expect(localPlaybackCancellation).not.toHaveBeenCalled();
    expect(renderedPetrinaut.aiAssistant?.renderComposerControl).toBeTypeOf(
      "function",
    );

    rendered.unmount();
    localPlaybackCancellation.mockRestore();
    vi.unstubAllGlobals();
  });

  test("correlates the existing Brunch transport request", () => {
    const options = defaultTransportOptions.current as {
      readonly headers: () => Record<string, string>;
    };

    expect(options.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  test.each([
    [true, "stop-requested"],
    [false, "already-settled"],
  ] as const)(
    "maps Flue abort result %s onto the host Stop contract",
    async (aborted, expected) => {
      const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted }));
      const client = { abort } as Pick<FlueClient, "abort"> as FlueClient;

      await expect(
        requestFlueStop(
          Promise.resolve(client),
          new BrunchPanelConversationTracker(),
        ),
      ).resolves.toBe(expected);
      expect(abort).toHaveBeenCalledOnce();
    },
  );

  test("lets an in-flight admission land before requesting the durable abort", async () => {
    const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted: true }));
    const client = { abort } as Pick<FlueClient, "abort"> as FlueClient;
    const tracker = new BrunchPanelConversationTracker();
    const stopListener = vi.fn();
    tracker.subscribeToStopRequested(stopListener);
    let admit: (() => void) | undefined;
    void tracker.trackSubmission(
      new Promise<void>((resolve) => {
        admit = resolve;
      }),
    );

    const stop = requestFlueStop(Promise.resolve(client), tracker);
    expect(stopListener).toHaveBeenCalledOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(abort).not.toHaveBeenCalled();

    admit?.();
    await expect(stop).resolves.toBe("stop-requested");
    expect(abort).toHaveBeenCalledOnce();
  });
});

/**
 * `navigation` is an optional prop, so dropping it from the editor compiles
 * and leaves every other check green while the demo silently stops mirroring
 * its location to the URL. These render the real component to pin the wiring.
 */
describe("local storage demo URL navigation", () => {
  // Without this, a tree left mounted by an earlier case re-renders after the
  // next one and overwrites the captured props with its own controller.
  afterEach(() => {
    cleanup();
    editorProps.current = null;
    forgetRenderedAssistant();
  });

  const mountedNavigation = (): PetrinautNavigationController => {
    const navigation = editorProps.current?.navigation;
    expect(navigation).toBeDefined();

    return navigation as PetrinautNavigationController;
  };

  test("resolves a URL-borne location into the controller it hands the editor", () => {
    seedStoredNet();

    render(
      <LocalStorageDemoApp
        onSearchChange={() => {}}
        search={{ subnet: "subnet-1", itemType: "place", itemId: "place-1" }}
      />,
    );

    const navigation = mountedNavigation();
    expect(navigation.state.subnetId).toBe("subnet-1");
    expect(navigation.state.selection).toEqual([
      { type: "place", id: "place-1" },
    ]);
  });

  test("writes an editor navigation back to the URL", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(<LocalStorageDemoApp onSearchChange={onSearchChange} search={{}} />);

    mountedNavigation().onNavigate(
      (current) => ({ ...current, subnetId: "subnet-2" }),
      {
        history: "push",
        intent: { cause: "user", action: "subnet" },
      },
    );

    expect(onSearchChange).toHaveBeenCalledWith({ subnet: "subnet-2" }, "push");
  });

  test("leaves history to the library default, so a discrete click pushes", () => {
    seedStoredNet();

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    // Constraining this page's policy once made selections replace, which left
    // the page with no history entries at all and sent the first Back press
    // off the site. The default keeps drag churn to one entry by replacing
    // continuing intents, so it needs no host override.
    expect(mountedNavigation().historyPolicy).toBeUndefined();
    expect(
      defaultPetrinautNavigationHistoryPolicy({
        cause: "user",
        action: "selection",
        phase: "discrete",
      }),
    ).toBe("push");
    expect(
      defaultPetrinautNavigationHistoryPolicy({
        cause: "user",
        action: "selection",
        phase: "continue",
      }),
    ).toBe("replace");
  });

  test("clears the shared location when a new net replaces the open one", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(
      <LocalStorageDemoApp
        onSearchChange={onSearchChange}
        search={{ subnet: "subnet-1", itemType: "place", itemId: "place-1" }}
      />,
    );

    // A location names a place inside the net that was open, so carrying it
    // into the next net would select something that is not there. Petrinaut's
    // own per-document reset does not cover a controlled location.
    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });

    expect(onSearchChange).toHaveBeenCalledWith({}, "replace");
  });

  test("clears a multi-item selection the URL never carried", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(<LocalStorageDemoApp onSearchChange={onSearchChange} search={{}} />);

    // A selection of more than one item projects to an empty search, so the
    // URL is already empty and writing `{}` to it changes no prop. Clearing
    // only through the URL therefore left this selection in place and carried
    // ids from the old net into the next one.
    act(() => {
      mountedNavigation().onNavigate(
        (current) => ({
          ...current,
          selection: [
            { type: "place", id: "place-1" },
            { type: "place", id: "place-2" },
          ],
        }),
        { history: "push", intent: { cause: "user", action: "selection" } },
      );
    });
    expect(mountedNavigation().state.selection).toHaveLength(2);

    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });

    expect(mountedNavigation().state.selection).toEqual([]);
  });
});

describe("local document revision persistence", () => {
  afterEach(() => {
    cleanup();
    editorProps.current = null;
    forgetRenderedAssistant();
  });

  test("retains direct document changes across handle reopen", async () => {
    flueClientOptions.current = null;
    seedStoredNet("local-incarnation", "local-revision-1");
    chooseAssistant("website.brunch");
    const firstView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(firstHandle.revisionId.get()).toBe("local-revision-1");

    act(() => {
      firstHandle.change((draft) => {
        draft.places.push({
          id: "direct-place",
          name: "Direct place",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });
    });
    const changedRevisionId = firstHandle.revisionId.get();
    expect(changedRevisionId).not.toBe("local-revision-1");
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { revisionId?: string }>;
      expect(stored["net-1"]?.revisionId).toBe(changedRevisionId);
    });

    firstView.unmount();
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const reopenedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(reopenedHandle.revisionId.get()).toBe(changedRevisionId);
  });

  test("lists each stored net with the time it was last written", async () => {
    seedStoredNet("local-incarnation", "local-revision-1");
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    expect(editorProps.current?.existingNets).toEqual([
      {
        netId: "net-1",
        title: "Seeded net",
        lastUpdated: "2020-01-01T00:00:00.000Z",
      },
    ]);

    const handle = editorProps.current?.handle as PetrinautDocHandle;
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "listed-place",
          name: "Listed place",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });
    });

    await waitFor(() => {
      const nets = editorProps.current?.existingNets as MinimalNetMetadata[];
      expect(new Date(nets[0]?.lastUpdated ?? 0).getTime()).toBeGreaterThan(
        new Date("2020-01-01T00:00:00.000Z").getTime(),
      );
    });
  });

  test("lists stored nets with the most recently updated first", () => {
    stubStorage();
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        "net-stale": storedNet({
          id: "net-stale",
          incarnationId: "stale-incarnation",
          lastUpdated: "2020-01-01T00:00:00.000Z",
          revisionId: "stale-revision",
          title: "Stale net",
        }),
        "net-fresh": storedNet({
          id: "net-fresh",
          incarnationId: "fresh-incarnation",
          lastUpdated: "2024-06-01T00:00:00.000Z",
          revisionId: "fresh-revision",
          title: "Fresh net",
        }),
      }),
    );
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    const nets = editorProps.current?.existingNets as MinimalNetMetadata[];
    expect(nets.map(({ netId }) => netId)).toEqual(["net-fresh", "net-stale"]);
  });

  test("adopts another tab's revision of the open document and chains later changes from it", async () => {
    seedStoredNet("local-incarnation", "local-revision-1");
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(firstHandle.revisionId.get()).toBe("local-revision-1");

    const otherTabPlace = {
      id: "other-tab-place",
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    };
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { sdcpn: { places: unknown[] } }>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        "net-1": {
          ...stored["net-1"],
          revisionId: "other-tab-revision",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sdcpn: { ...stored["net-1"]?.sdcpn, places: [otherTabPlace] },
        },
      }),
    );
    act(() => {
      window.dispatchEvent(otherTabStorageEvent("petrinaut-sdcpn"));
    });

    await waitFor(() =>
      expect(
        (
          editorProps.current?.handle as PetrinautDocHandle | undefined
        )?.revisionId.get(),
      ).toBe("other-tab-revision"),
    );
    const adoptedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(adoptedHandle).not.toBe(firstHandle);
    expect(adoptedHandle.doc()?.places.map((place) => place.id)).toEqual([
      "other-tab-place",
    ]);

    act(() => {
      adoptedHandle.change((draft) => {
        draft.places.push({ ...otherTabPlace, id: "this-tab-place" });
      });
    });
    const chainedRevisionId = adoptedHandle.revisionId.get();
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        { revisionId?: string; sdcpn: { places: { id: string }[] } }
      >;
      expect(persisted["net-1"]?.revisionId).toBe(chainedRevisionId);
      expect(persisted["net-1"]?.sdcpn.places.map((place) => place.id)).toEqual(
        ["other-tab-place", "this-tab-place"],
      );
    });
    expect(editorProps.current?.handle).toBe(adoptedHandle);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("reports a refused change and reopens the editor from the repository's record so the next change is accepted", async () => {
    seedStoredNet("local-incarnation", "local-revision-1");
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const refusedHandle = editorProps.current?.handle as PetrinautDocHandle;
    const addPlace = (handle: PetrinautDocHandle, id: string) =>
      act(() => {
        handle.change((draft) => {
          draft.places.push({
            id,
            name: id,
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          });
        });
      });

    // Another tab moves net-1 on; its storage event has not reached this tab,
    // so the open handle's next change names a predecessor the store no
    // longer holds. A handle kept after the refusal would name its refused
    // revision as the predecessor and be refused again.
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, Record<string, unknown>>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        "net-1": { ...stored["net-1"], revisionId: "other-tab-revision" },
      }),
    );

    addPlace(refusedHandle, "refused-place");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("not saved");
    expect(alert.textContent).toContain(
      "revision does not follow its predecessor",
    );
    // The refused change is dropped: the editor reopens from the record.
    await waitFor(() =>
      expect(editorProps.current?.handle).not.toBe(refusedHandle),
    );
    const reopenedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(reopenedHandle.revisionId.get()).toBe("other-tab-revision");
    expect(reopenedHandle.doc()?.places).toEqual([]);
    // The notice outlives the handle it was raised for.
    expect(screen.getByRole("alert").textContent).toContain(
      "revision does not follow its predecessor",
    );

    addPlace(reopenedHandle, "accepted-place");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(editorProps.current?.handle).toBe(reopenedHandle);
    const persisted = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { revisionId?: string; sdcpn: { places: { id: string }[] } }
    >;
    expect(persisted["net-1"]?.revisionId).toBe(
      reopenedHandle.revisionId.get(),
    );
    expect(persisted["net-1"]?.sdcpn.places.map((place) => place.id)).toEqual([
      "accepted-place",
    ]);
  });

  test("forgets a refused change once another document is opened", async () => {
    seedStoredNet("local-incarnation", "local-revision-1");
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, Record<string, unknown>>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        "net-2": {
          ...stored["net-1"],
          id: "net-2",
          title: "Second net",
          incarnationId: "second-incarnation",
          revisionId: "second-revision",
          lastUpdated: "2019-01-01T00:00:00.000Z",
        },
      }),
    );
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const handle = editorProps.current?.handle as PetrinautDocHandle;
    expect(handle.revisionId.get()).toBe("local-revision-1");

    // Another tab moves net-1 on; its storage event has not reached this tab.
    // (Its place also keeps net-1 from being pruned as empty when net-2 opens.)
    const otherTabPlace = {
      id: "other-tab-place",
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    };
    const current = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { sdcpn: Record<string, unknown> }>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...current,
        "net-1": {
          ...current["net-1"],
          revisionId: "other-tab-revision",
          sdcpn: { ...current["net-1"]?.sdcpn, places: [otherTabPlace] },
        },
      }),
    );
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "refused-place",
          name: "Refused place",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });
    });
    await screen.findByRole("alert");

    const loadPetriNet = editorProps.current?.loadPetriNet as (
      petriNetId: string,
    ) => void;
    act(() => loadPetriNet("net-2"));
    await waitFor(() => expect(editorProps.current?.title).toBe("Second net"));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => loadPetriNet("net-1"));
    await waitFor(() => expect(editorProps.current?.title).toBe("Seeded net"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("keeps one session across revisions and replaces one client/tracker pair when document identity changes", async () => {
    seedStoredNet("first-incarnation", "first-revision");
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    stored["net-2"] = storedNet({
      id: "net-2",
      incarnationId: "second-incarnation",
      lastUpdated: "2019-01-01T00:00:00.000Z",
      title: "Second net",
    });
    localStorage.setItem("petrinaut-sdcpn", JSON.stringify(stored));
    chooseAssistant("website.brunch");
    brunchPanelTransportSessions.current = [];
    flueClientMock.current = {
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => ({ phase: "absent" }),
        refresh: vi.fn(),
        subscribe: () => () => undefined,
      }),
    };
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(brunchPanelTransportSessions.current.length).toBeGreaterThan(0),
    );
    const uniqueSessions = () => [
      ...new Map(
        brunchPanelTransportSessions.current.map((session) => [
          session.client,
          session,
        ]),
      ).values(),
    ];
    const [firstSession] = uniqueSessions();
    expect(firstSession).toBeDefined();

    const handle = editorProps.current?.handle as PetrinautDocHandle;
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "first-place",
          name: "First place",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });
    });
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { revisionId?: string }>;
      expect(persisted["net-1"]?.revisionId).toBe(handle.revisionId.get());
    });
    expect(uniqueSessions()).toEqual([firstSession]);

    const loadPetriNet = editorProps.current?.loadPetriNet as (
      petriNetId: string,
    ) => void;
    act(() => loadPetriNet("net-2"));

    await waitFor(() => {
      expect(uniqueSessions()).toHaveLength(2);
    });
    const [, secondSession] = uniqueSessions();
    expect(secondSession?.client).not.toBe(firstSession?.client);
    expect(secondSession?.tracker).not.toBe(firstSession?.tracker);
  });
});

describe("local storage demo Brunch controls", () => {
  afterEach(() => {
    cleanup();
    editorProps.current = null;
    forgetRenderedAssistant();
    brunchPreviewConfig.isBrunchConfigured = true;
  });

  test("clearing ordinary Brunch starts a persisted fresh conversation without replacing the model", async () => {
    seedStoredNet("clear-incarnation");
    chooseAssistant("website.brunch");
    flueClientMock.current = {
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
    const view = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(renderedPetrinaut.aiAssistant).not.toBeNull());
    const first = currentAssistant();
    const originalId = first.conversationId;
    const handle = editorProps.current?.handle;
    expect(first.canClearMessages).toBe(true);
    act(() => first.onClearMessages?.());
    const next = currentAssistant();
    expect(next.conversationId).not.toBe(originalId);
    expect(next.conversationId).toContain(
      "brunch-construction-v1:clear-incarnation:",
    );
    expect(next.automaticTools).not.toBe(first.automaticTools);
    expect(editorProps.current?.handle).toBe(handle);
    const nextId = next.conversationId;
    view.unmount();
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(renderedPetrinaut.aiAssistant?.conversationId).toBe(nextId),
    );
  });

  test("a destructive edit waiting for approval settles when the conversation is replaced", async () => {
    seedStoredNet("pending-incarnation");
    chooseAssistant("website.brunch");
    flueClientMock.current = {
      url: "http://brunch.local/agents/chat/instance",
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
          input: { placeId: "queue" },
        });
      }),
    );
    try {
      render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
      await waitFor(() =>
        expect(renderedPetrinaut.aiAssistant?.inBandBrowserTools).toBeDefined(),
      );
      const assistant = currentAssistant();
      const initialTools = assistant.interactiveTools;
      const execute = vi.fn(async () => ({ applied: true }));
      const run = assistant.inBandBrowserTools?.run(
        {
          toolCallId: "remove-1",
          toolName: "removePlace",
          input: { placeId: "queue" },
          signal: new AbortController().signal,
        },
        execute,
      );
      const interactiveTools = () =>
        renderedPetrinaut.aiAssistant?.interactiveTools;
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

  test.each(["metaKey", "ctrlKey"])(
    "reserves %s + Shift + K for the assistant and keeps plain K for the palette",
    (modifier) => {
      seedStoredNet();
      render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
      fireEvent.keyDown(window, { key: "K", [modifier]: true, shiftKey: true });
      expect(
        screen.queryByRole("dialog", { name: "Command palette" }),
      ).toBeNull();
      fireEvent.keyDown(window, { key: "k", [modifier]: true });
      expect(
        screen.getByRole("dialog", { name: "Command palette" }),
      ).not.toBeNull();
    },
  );

  test("mounts document-bound Brunch with canonical overrides and the complete static catalogue", async () => {
    const incarnationId = "ordinary-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.brunch");
    flueClientMock.current = {
      history: async () => ({
        conversation: {
          conversationId: ordinaryConstructionConversationIdFrom(incarnationId),
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

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(renderedPetrinaut.aiAssistant).not.toBeNull());
    const aiAssistant = currentAssistant();
    const transportOptions = brunchPanelTransportOptions.current as {
      readonly initialData?: { readonly binding?: unknown };
      readonly clientToolNames?: ReadonlySet<string>;
      readonly dynamicClientToolNames?: ReadonlySet<string>;
      readonly mapClientToolInput?: (call: {
        input: unknown;
        toolCallId: string;
        toolName: string;
      }) => unknown;
    };

    const conversationId = brunchEvaluationConversationIdFrom(
      ordinaryConstructionConversationIdFrom(incarnationId),
    );
    expect(aiAssistant.conversationId).toBe(conversationId);
    expect(aiAssistant.executeMutation).toBeUndefined();
    expect(aiAssistant.automaticTools?.map(({ toolName }) => toolName)).toEqual(
      [
        "getLatestNetDefinition",
        "getNetCompilationErrors",
        "addPlace",
        "addTransition",
        "addArc",
      ],
    );
    expect(aiAssistant.primaryLabel).toBe("Chat");
    // The Ledger follows the history observation, a tick after the chat.
    await waitFor(() =>
      expect(renderedPetrinaut.tabs.map(({ label }) => label)).toEqual([
        "Ledger",
      ]),
    );
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
      documentId: "net-1",
      incarnationId,
    });
    expect([...(transportOptions.clientToolNames ?? [])].toSorted()).toEqual(
      [...brunchPetrinautClientToolNames].toSorted(),
    );
    expect(
      aiAssistant.interactiveTools?.map(({ toolName }) => toolName),
    ).toEqual(
      expect.arrayContaining([
        brunchTools.draftPetrinautExperiment,
        "removePlace",
      ]),
    );
    expect(transportOptions.mapClientToolInput).toEqual(expect.any(Function));
    // Every configured Brunch browser tool, the draft included, settles in band.
    expect(aiAssistant.inBandBrowserTools?.has(createExperimentToolName)).toBe(
      true,
    );
    expect(
      aiAssistant.inBandBrowserTools?.has(brunchTools.draftPetrinautExperiment),
    ).toBe(false);
    // I captures the experiment source at the browser lane barrier, not while projecting transport input.
    expect(
      [...(transportOptions.dynamicClientToolNames ?? [])].toSorted(),
    ).toEqual(
      [
        ...canonicalPetrinautClientToolNames,
        brunchTools.draftPetrinautExperiment,
      ].toSorted(),
    );
  });
});

describe("assistant selection", () => {
  test("installs Petrinaut AI first by default and Brunch first when the launch default names it", () => {
    expect(resolveDefaultAssistant(undefined)).toBe("petrinaut-ai");
    expect(resolveDefaultAssistant("")).toBe("petrinaut-ai");
    expect(resolveDefaultAssistant("petrinaut-ai")).toBe("petrinaut-ai");
    expect(resolveDefaultAssistant("brunch")).toBe("brunch");
    expect(() => resolveDefaultAssistant("other")).toThrow(
      /VITE_PETRINAUT_DEFAULT_ASSISTANT/u,
    );
  });

  const flueHistoryClient = (incarnationId: string) => ({
    history: async () => ({
      conversation: {
        conversationId: ordinaryConstructionConversationIdFrom(incarnationId),
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
  });
  /** `fetch` answering the Voice configuration route with `body`. */
  const stubVoiceConfig = (body: unknown) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(body),
    );
    vi.stubGlobal("fetch", fetch);

    return fetch;
  };
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
  const executeCurrentCanonicalMutation = (
    toolCallId: string,
    toolName: "addPlace" | "addTransition" | "addArc",
    input: unknown,
  ) => {
    const tool = currentAssistant().automaticTools?.find(
      (candidate) => candidate.toolName === toolName,
    );
    expect(tool).toBeDefined();

    return tool?.execute({
      commands: {},
      handle: editorProps.current?.handle,
      input,
      mutations: {},
      readDiagnosticsContext: async () => "",
      signal: new AbortController().signal,
      toolCallId,
      viewport: {},
    } as never);
  };
  const executeCurrentReadCall = (toolCallId: string) => {
    const tool = currentAssistant().automaticTools?.find(
      ({ toolName }) => toolName === "getLatestNetDefinition",
    );
    expect(tool).toBeDefined();

    return tool?.execute({
      commands: {},
      handle: editorProps.current?.handle,
      input: {},
      mutations: {},
      readDiagnosticsContext: async () => "",
      signal: new AbortController().signal,
      toolCallId,
      viewport: {},
    } as never);
  };
  const currentVoiceProvider = () => {
    const control = currentAssistant().renderVoiceMode?.({
      canAcceptVoiceInput: true,
      conversationId: "labs-test",
      inputMode: "text",
      isAiAssistantOpen: true,
      messages: [],
      registerVoiceModeControls: vi.fn(() => () => {}),
      reportVoiceSessionState: vi.fn(),
      setInputMode: vi.fn(),
      setVoiceActive: vi.fn(),
      status: "ready",
      stop: vi.fn(async () => {}),
      submitText: vi.fn(),
      submitVoiceInput: vi.fn(),
    });
    if (!isValidElement<{ config: { provider?: string } }>(control)) {
      throw new Error("Expected a configured Voice control.");
    }

    return control.props.config.provider;
  };

  afterEach(() => {
    cleanup();
    editorProps.current = null;
    brunchPanelTransportOptions.current = null;
    brunchPreviewConfig.isBrunchConfigured = true;
    forgetRenderedAssistant();
    vi.unstubAllGlobals();
  });

  test("Petrinaut AI is the default and never mounts Flue history", () => {
    seedStoredNet("petrinaut-ai-incarnation", "petrinaut-ai-revision");
    const observe = vi.fn();
    const history = vi.fn();
    flueClientMock.current = { history, observe };
    flueClientOptions.current = null;

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    const petrinautAi = currentAssistant();
    expect((defaultTransportOptions.current as { api: string }).api).toBe(
      petrinautAiChatEndpoint,
    );
    // No host catalogue: Petrinaut's canonical built-ins stay active; their
    // execution is pinned in ai-assistant-panel.test.tsx.
    expect(petrinautAi.automaticTools).toBeUndefined();
    expect(flueClientOptions.current).toBeNull();
    expect(history).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    // Nothing chosen yet: the first installed assistant is the default, and
    // Voice is installed beside Brunch for when it is chosen.
    expect(storedAssistantChoice()).toBeNull();
    expect(installedPluginIds()).toEqual([
      "website.command-palette",
      "website.petrinaut-ai",
      "website.brunch",
      "website.voice",
    ]);
    expect(renderedPetrinaut.tabs).toEqual([]);
    expect(petrinautAi.renderVoiceMode).toBeUndefined();
  });

  test("Voice is on for Brunch by default and the Realtime flag persists across reloads", async () => {
    const incarnationId = "labs-persistence-incarnation";
    seedStoredNet(incarnationId);
    flueClientMock.current = flueHistoryClient(incarnationId);
    stubVoiceConfig({ available: true, connectionTimeoutMs: 10_000 });

    const firstView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    expect(currentAssistant().renderVoiceMode).toBeUndefined();

    switchAssistant("website.brunch");
    await waitFor(() => expect(storedAssistantChoice()).toBe("website.brunch"));
    await waitFor(() => expect(currentVoiceProvider()).toBe("live"));
    // Defaults are not written until a flag is set.
    expect(storedVoiceFlags()).toEqual({});

    setVoiceFlag("realtime", true);
    await waitFor(() => expect(currentVoiceProvider()).toBe("realtime"));
    expect(storedVoiceFlags()).toEqual({ voice: true, realtime: true });

    firstView.unmount();
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentVoiceProvider()).toBe("realtime"));

    setVoiceFlag("voice", false);
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeUndefined(),
    );
    expect(storedVoiceFlags()).toEqual({ voice: false, realtime: true });

    setVoiceFlag("voice", true);
    setVoiceFlag("realtime", false);
    await waitFor(() => expect(currentVoiceProvider()).toBe("live"));
  });

  test("a stored Brunch choice remains selectable and switching to Petrinaut AI mounts nothing of Brunch", async () => {
    const incarnationId = "selection-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.brunch");
    flueClientMock.current = flueHistoryClient(incarnationId);
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    expect(currentAssistant().executeMutation).toBeUndefined();
    expect(storedAssistantChoice()).toBe("website.brunch");
    await waitFor(() =>
      expect(renderedPetrinaut.tabs.map(({ id }) => id)).toEqual(["ledger"]),
    );
    const brunchTransport = currentAssistant().transport;

    switchAssistant("website.petrinaut-ai");

    await waitFor(() => expect(currentAssistant().requestStop).toBeUndefined());
    const petrinautAi = currentAssistant();
    expect(petrinautAi.executeMutation).toBeUndefined();
    expect(petrinautAi.transport).not.toBe(brunchTransport);
    expect((defaultTransportOptions.current as { api: string }).api).toBe(
      petrinautAiChatEndpoint,
    );
    expect(petrinautAi.automaticTools).toBeUndefined();
    expect(renderedPetrinaut.tabs).toEqual([]);
    expect(petrinautAi.renderVoiceMode).toBeUndefined();
    expect(petrinautAi.requestStop).toBeUndefined();
    expect(petrinautAi.followMessages).toBeUndefined();
    expect(petrinautAi.canClearMessages).toBe(true);
    expect(storedAssistantChoice()).toBe("website.petrinaut-ai");
  });

  test("defaults Voice on for saved Brunch, honours a stored opt-out, and removes it for Petrinaut AI", async () => {
    seedStoredNet("voice-gating-incarnation");
    chooseAssistant("website.brunch");
    flueClientMock.current = flueHistoryClient("voice-gating-incarnation");
    const fetch = stubVoiceConfig({
      available: true,
      connectionTimeoutMs: 10_000,
    });
    const defaultView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(storedVoiceFlags()).toEqual({});

    defaultView.unmount();
    seedVoiceFlags({ voice: false });
    const disabledView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    expect(currentAssistant().renderVoiceMode).toBeUndefined();

    disabledView.unmount();
    seedVoiceFlags({ voice: true });
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );
    renderedAssistants.length = 0;

    switchAssistant("website.petrinaut-ai");

    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant.renderVoiceMode === undefined,
      ),
    ).toBe(true);
    expect(storedVoiceFlags()).toEqual({ voice: true });
  });

  test("does not render Voice when the flag is on but the deployment has no voice", async () => {
    const incarnationId = "unavailable-voice-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.brunch");
    seedVoiceFlags({ voice: true });
    flueClientMock.current = flueHistoryClient(incarnationId);
    const fetch = stubVoiceConfig({ available: false });

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    // Let the configuration answer land before judging the composer.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    expect(storedVoiceFlags()).toEqual({ voice: true });
  });

  test("clears cached Voice capability during each Petrinaut AI to Brunch check", async () => {
    const incarnationId = "delayed-voice-capability-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.petrinaut-ai");
    seedVoiceFlags({ voice: true });
    flueClientMock.current = flueHistoryClient(incarnationId);
    const firstCapability = Promise.withResolvers<Response>();
    const secondCapability = Promise.withResolvers<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(firstCapability.promise)
      .mockReturnValueOnce(secondCapability.promise);
    vi.stubGlobal("fetch", fetch);
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    renderedAssistants.length = 0;
    switchAssistant("website.brunch");
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    // The capability is unknown until the route answers: no Voice meanwhile.
    expect(renderedPetrinaut.aiAssistant?.renderVoiceMode).toBeUndefined();
    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant.renderVoiceMode === undefined,
      ),
    ).toBe(true);

    firstCapability.resolve(
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );

    switchAssistant("website.petrinaut-ai");
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeUndefined(),
    );
    switchAssistant("website.brunch");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    // The capability is checked again; the composer settles without Voice
    // until the route answers.
    expect(renderedPetrinaut.aiAssistant?.renderVoiceMode).toBeUndefined();

    secondCapability.resolve(
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );
  });

  test("each assistant keeps its own history: Petrinaut AI messages stay in the local store and are never handed to Brunch", async () => {
    const incarnationId = "history-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.petrinaut-ai");
    flueClientMock.current = flueHistoryClient(incarnationId);
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant()).toBeDefined());
    const petrinautAi = currentAssistant();
    expect(petrinautAi.executeMutation).toBeUndefined();

    const petrinautAiMessage = {
      id: "petrinaut-ai-1",
      role: "user",
      parts: [{ type: "text", text: "Petrinaut AI turn" }],
    } as PetrinautAiMessage;
    act(() => petrinautAi.onMessages?.([petrinautAiMessage]));
    await waitFor(() =>
      expect(currentAssistant().messages).toEqual([petrinautAiMessage]),
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut-ai-messages") ?? "{}"),
    ).toEqual({
      "net-1": [petrinautAiMessage],
    });

    switchAssistant("website.brunch");
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    const brunch = currentAssistant();
    expect(brunch.executeMutation).toBeUndefined();
    expect(brunch.messages ?? []).not.toContainEqual(petrinautAiMessage);
    act(() =>
      brunch.onMessages?.([
        { id: "brunch-1", role: "user", parts: [] } as PetrinautAiMessage,
      ]),
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut-ai-messages") ?? "{}"),
    ).toEqual({
      "net-1": [petrinautAiMessage],
    });

    switchAssistant("website.petrinaut-ai");
    await waitFor(() => expect(currentAssistant().requestStop).toBeUndefined());
    expect(currentAssistant().executeMutation).toBeUndefined();
    expect(currentAssistant().messages).toEqual([petrinautAiMessage]);
  });

  test("an absent replay baseline stays immutable when admission refresh publishes its live calls", async () => {
    const incarnationId = "live-baseline-incarnation";
    seedStoredNet(incarnationId);
    chooseAssistant("website.brunch");
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

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    const initialTools = currentAssistant().automaticTools;
    const canonicalInput = {
      id: "canonical-live",
      name: "CanonicalLive",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
                toolName: "query_workpiece",
                toolCallId: "ledger-query",
                state: "output-available",
                input: {},
                output: {
                  binding: {
                    conversationId,
                    documentId: "net-1",
                    incarnationId,
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
    const handle = editorProps.current?.handle as
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

  test("a document incarnation change resets the replay baseline and live-call adapter", async () => {
    seedStoredNet("first-incarnation");
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    stored["net-2"] = storedNet({
      id: "net-2",
      incarnationId: "second-incarnation",
      lastUpdated: "2019-01-01T00:00:00.000Z",
      title: "Second net",
    });
    localStorage.setItem("petrinaut-sdcpn", JSON.stringify(stored));
    chooseAssistant("website.brunch");
    flueClientMock.current = flueHistoryClient("first-incarnation");

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    const firstMutation = currentAssistant().automaticTools?.find(
      ({ toolName }) => toolName === "addPlace",
    );
    const firstInput = {
      ...placeInput,
      id: "first-place",
      name: "FirstPlace",
    };
    // History loads asynchronously; a call refused before it starts records nothing.
    const firstOutput = (await waitFor(() =>
      executeCurrentCanonicalMutation("reused-call", "addPlace", firstInput),
    )) as { applied?: boolean } | undefined;
    // Mutations are stubbed, so Petrinaut reports its own unchanged result; the
    // point is that each incarnation's call reaches Petrinaut rather than being refused.
    expect(firstOutput).toHaveProperty("applied");

    const loadPetriNet = editorProps.current?.loadPetriNet as
      | ((id: string) => void)
      | undefined;
    expect(loadPetriNet).toBeDefined();
    act(() => loadPetriNet?.("net-2"));
    await waitFor(() => expect(editorProps.current?.title).toBe("Second net"));
    await waitFor(() => {
      expect(
        currentAssistant().automaticTools?.find(
          ({ toolName }) => toolName === "addPlace",
        ),
      ).not.toBe(firstMutation);
    });
    const secondOutput = (await waitFor(() =>
      executeCurrentCanonicalMutation("reused-call", "addPlace", {
        ...placeInput,
        id: "second-place",
        name: "SecondPlace",
      }),
    )) as { applied?: boolean } | undefined;
    expect(secondOutput).toHaveProperty("applied");
  });

  test("I does not execute a canonical write while history is loading", async () => {
    seedStoredNet("loading-incarnation");
    chooseAssistant("website.brunch");
    flueClientMock.current = {
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => ({ phase: "loading" }),
        refresh: vi.fn(),
        subscribe: () => () => undefined,
      }),
    };
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
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
        differentialEquationId: null,
        x: 0,
        y: 0,
        targetSubnetId: null,
      }),
    ).toThrow("Conversation history is not ready");
    const handle = editorProps.current?.handle as PetrinautDocHandle;
    expect(handle.doc()?.places).toEqual([]);
  });

  test("a pending bound mutation in history is not executed again after reload", async () => {
    seedStoredNet("pending-incarnation");
    chooseAssistant("website.brunch");
    const pendingPlace = {
      id: "pending",
      name: "Pending",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
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
    const handle = editorProps.current?.handle as PetrinautDocHandle;
    expect(handle.doc()?.places).toEqual([]);
  });

  test("without a configured Brunch endpoint there is no choice to make", () => {
    brunchPreviewConfig.isBrunchConfigured = false;
    seedStoredNet();
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const petrinautAi = currentAssistant();
    expect(petrinautAi.executeMutation).toBeUndefined();
    expect(petrinautAi.automaticTools).toBeUndefined();
    // Neither Brunch nor Voice is installed, so Petrinaut lists one assistant
    // and registers no switch command.
    expect(installedPluginIds()).toEqual([
      "website.command-palette",
      "website.petrinaut-ai",
    ]);
  });
});
