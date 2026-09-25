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
import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";
import { brunchModes, brunchTools } from "@hashintel/brunch-agent/constants";
import { createExperimentToolName } from "@hashintel/petrinaut-core";
import { defaultPetrinautNavigationHistoryPolicy } from "@hashintel/petrinaut/react";

import { OpenAIRealtimeSession } from "../voice-interview/openai-realtime-session";
import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";
import {
  assistantSelectionStorageKey,
  defaultAssistantSelection,
  parseAssistantSelection,
  resolveDefaultAssistantSelection,
} from "./assistant-selection";
import {
  canonicalPetrinautClientToolNames,
  integratedPetrinautClientToolNames,
} from "./brunch-client-tools";
import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "./brunch-conversation-id";
import { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import {
  getBrunchVoiceMode,
  LocalStorageDemoApp,
  requestFlueStop,
} from "./local-storage-demo-app";
import { voicePreferenceStorageKey } from "./voice-preference";

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
  PetrinautAiAssistant,
  PetrinautAiMessage,
} from "@hashintel/petrinaut/ui";

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
const renderedPetrinaut = vi.hoisted(() => ({ aiAssistant: null as unknown }));
const renderedAssistants = vi.hoisted(() => [] as PetrinautAiAssistant[]);
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
vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => brunchPreviewConfig,
}));

const editorProps = vi.hoisted(() => ({
  current: null as {
    aiAssistant?: unknown;
    createNewNet?: (params: {
      petriNetDefinition: unknown;
      title: string;
    }) => void;
    existingNets?: unknown;
    handle?: unknown;
    loadPetriNet?: unknown;
    navigation?: unknown;
    slots?: { settingsLabs?: ReactNode };
    title?: string;
  } | null,
}));

vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));
vi.mock("./brunch-panel-transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./brunch-panel-transport")>();
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

vi.mock("@hashintel/petrinaut/ui", () => ({
  DefaultChatTransport: class {
    public constructor(options: unknown) {
      defaultTransportOptions.current = options;
    }
  },
  Petrinaut: (props: Record<string, unknown>) => {
    editorProps.current = props;
    renderedPetrinaut.aiAssistant = props.aiAssistant;
    renderedAssistants.push(props.aiAssistant as PetrinautAiAssistant);
    return (
      (props.slots as { settingsLabs?: ReactNode } | undefined)?.settingsLabs ??
      null
    );
  },
  WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
  executePetrinautAiMutation: () => ({
    applied: false,
    reason: "Mocked document unchanged.",
  }),
}));

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
    renderedPetrinaut.aiAssistant = null;
    stubStorage();
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    const aiAssistant = renderedPetrinaut.aiAssistant as PetrinautAiAssistant;

    expect(aiAssistant.requestStop).toBeTypeOf("function");
    expect(aiAssistant.executeMutation).toBeUndefined();
    expect(
      aiAssistant.interactiveTools?.map(({ toolName }) => toolName),
    ).toEqual([brunchTools.draftPetrinautExperiment]);
    expect(aiAssistant.resolveToolPresentation).toBeTypeOf("function");
    expect(aiAssistant.workingLabel).toBe("Brunch is working");
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

    rendered.unmount();
    vi.unstubAllGlobals();
  });

  test("waits for a durable offset before baselining present Ledger history", async () => {
    renderedPetrinaut.aiAssistant = null;
    stubStorage();
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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

    const rendered = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(renderedPetrinaut.aiAssistant).not.toBeNull());

    expect(
      (renderedPetrinaut.aiAssistant as PetrinautAiAssistant).additionalTab
        ?.activityIdentities,
    ).toBeUndefined();

    rendered.unmount();
    vi.unstubAllGlobals();
  });

  test("keeps durable Flue Stop distinct from local playback cancellation", async () => {
    renderedPetrinaut.aiAssistant = null;
    stubStorage();
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
      expect(
        (renderedPetrinaut.aiAssistant as PetrinautAiAssistant).requestStop,
      ).toBeTypeOf("function"),
    );
    const aiAssistant = renderedPetrinaut.aiAssistant as PetrinautAiAssistant;

    await expect(aiAssistant.requestStop?.()).resolves.toBe("stop-requested");
    expect(abort).toHaveBeenCalledOnce();
    expect(localPlaybackCancellation).not.toHaveBeenCalled();
    expect(
      (renderedPetrinaut.aiAssistant as PetrinautAiAssistant)
        .renderComposerControl,
    ).toBeUndefined();

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
    renderedAssistants.length = 0;
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
  });

  test("retains direct document changes across handle reopen", async () => {
    flueClientOptions.current = null;
    seedStoredNet("local-incarnation", "local-revision-1");
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    brunchPreviewConfig.isBrunchConfigured = true;
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

  test("mounts integrated Brunch with canonical overrides and the complete static catalogue", async () => {
    const incarnationId = "ordinary-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    await waitFor(() => expect(editorProps.current?.aiAssistant).toBeDefined());
    const aiAssistant = editorProps.current
      ?.aiAssistant as PetrinautAiAssistant;
    const transportOptions = brunchPanelTransportOptions.current as {
      readonly initialData?: {
        readonly mode?: string;
        readonly construction?: { readonly binding?: unknown };
      };
      readonly clientToolNames?: ReadonlySet<string>;
      readonly asyncClientToolNames?: ReadonlySet<string>;
      readonly dynamicClientToolNames?: ReadonlySet<string>;
      readonly mapClientToolInput?: (call: {
        input: unknown;
        toolCallId: string;
        toolName: string;
      }) => unknown;
      readonly clientToolResultMetadata?: (result: {
        toolCallId: string;
        output: unknown;
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
    expect(transportOptions.initialData?.mode).toBe(brunchModes.integrated);
    expect(transportOptions.initialData?.construction?.binding).toEqual({
      conversationId,
      documentId: "net-1",
      incarnationId,
    });
    expect([...(transportOptions.clientToolNames ?? [])].toSorted()).toEqual(
      [...integratedPetrinautClientToolNames].toSorted(),
    );
    expect(
      aiAssistant.interactiveTools?.map(({ toolName }) => toolName),
    ).toEqual([brunchTools.draftPetrinautExperiment]);
    expect(transportOptions.mapClientToolInput).toEqual(expect.any(Function));
    // Every Brunch browser tool, the draft included, settles in band.
    expect(
      [...(transportOptions.asyncClientToolNames ?? [])].toSorted(),
    ).toEqual([...integratedPetrinautClientToolNames].toSorted());
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
  test("uses Stock by default, accepts a Brunch launch default, and preserves explicit choices", () => {
    expect(resolveDefaultAssistantSelection(undefined)).toBe("stock");
    expect(resolveDefaultAssistantSelection("")).toBe("stock");
    expect(resolveDefaultAssistantSelection("stock")).toBe("stock");
    expect(resolveDefaultAssistantSelection("brunch")).toBe("brunch");
    expect(() => resolveDefaultAssistantSelection("other")).toThrow(
      /VITE_PETRINAUT_DEFAULT_ASSISTANT/u,
    );
    expect(defaultAssistantSelection).toBe("stock");
    expect(parseAssistantSelection(null)).toBe("stock");
    expect(parseAssistantSelection("unknown")).toBe("stock");
    expect(parseAssistantSelection("stock")).toBe("stock");
    expect(parseAssistantSelection("brunch")).toBe("brunch");
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
  const switchAssistant = (label: RegExp) => {
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: label }));
  };
  const currentAssistant = () =>
    editorProps.current?.aiAssistant as PetrinautAiAssistant;
  const currentVoiceCapability = () => {
    const settingsLabs = editorProps.current?.slots?.settingsLabs;
    if (!isValidElement<{ openAIVoiceConfig: unknown }>(settingsLabs)) {
      throw new Error("Expected the website Labs settings to render.");
    }
    return settingsLabs.props.openAIVoiceConfig;
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
    vi.unstubAllGlobals();
  });

  test("ordinary Stock is the default and never mounts Flue history", () => {
    seedStoredNet("stock-incarnation", "stock-revision");
    const observe = vi.fn();
    const history = vi.fn();
    flueClientMock.current = { history, observe };
    flueClientOptions.current = null;

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    const stock = currentAssistant();
    expect((defaultTransportOptions.current as { api: string }).api).toBe(
      "/api/chat",
    );
    // An empty host catalogue leaves Petrinaut's canonical built-ins active;
    // their execution is pinned in ai-assistant-panel.test.tsx.
    expect(stock.automaticTools).toEqual([]);
    expect(flueClientOptions.current).toBeNull();
    expect(history).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(editorProps.current?.slots?.settingsLabs).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Use Brunch" })).toHaveProperty(
      "checked",
      false,
    );
    expect(
      screen.getByRole("checkbox", { name: "Enable Voice" }),
    ).toHaveProperty("checked", false);
    expect(screen.queryByText(/evaluation mode/iu)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  test("selecting Brunch enables Voice and persists the opt-in Realtime choice", async () => {
    const incarnationId = "labs-persistence-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(voicePreferenceStorageKey, "false");
    flueClientMock.current = flueHistoryClient(incarnationId);
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          available: true,
          connectionTimeoutMs: 10_000,
          provider: "realtime",
        }),
      ),
    );

    const firstView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    const firstBrunchToggle = await screen.findByRole("checkbox", {
      name: "Use Brunch",
    });
    const firstVoiceToggle = screen.getByRole("checkbox", {
      name: "Enable Voice",
    });
    await waitFor(() =>
      expect(firstBrunchToggle).toHaveProperty("disabled", false),
    );
    expect(firstVoiceToggle).toHaveProperty("checked", false);
    expect(
      screen.queryByRole("checkbox", { name: "Realtime mode" }),
    ).toBeNull();

    fireEvent.click(firstBrunchToggle);
    await waitFor(() => {
      expect(localStorage.getItem(assistantSelectionStorageKey)).toBe("brunch");
      expect(firstVoiceToggle).toHaveProperty("disabled", false);
      expect(firstVoiceToggle).toHaveProperty("checked", true);
      expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
    });
    const realtimeToggle = screen.getByRole("checkbox", {
      name: "Realtime mode",
    });
    expect(realtimeToggle).toHaveProperty("checked", false);
    expect(currentVoiceProvider()).toBe("live");
    fireEvent.click(realtimeToggle);
    expect(realtimeToggle).toHaveProperty("checked", true);
    await waitFor(() => expect(currentVoiceProvider()).toBe("realtime"));

    firstView.unmount();
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const restoredBrunchToggle = await screen.findByRole("checkbox", {
      name: "Use Brunch",
    });
    const restoredVoiceToggle = screen.getByRole("checkbox", {
      name: "Enable Voice",
    });
    await waitFor(() => {
      expect(restoredBrunchToggle).toHaveProperty("checked", true);
      expect(restoredVoiceToggle).toHaveProperty("checked", true);
      expect(restoredVoiceToggle).toHaveProperty("disabled", false);
      expect(
        screen.getByRole("checkbox", { name: "Realtime mode" }),
      ).toHaveProperty("checked", true);
      expect(currentVoiceProvider()).toBe("realtime");
    });
    fireEvent.click(restoredVoiceToggle);
    await waitFor(() =>
      expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("false"),
    );
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    expect(
      screen.queryByRole("checkbox", { name: "Realtime mode" }),
    ).toBeNull();
    fireEvent.click(restoredVoiceToggle);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Realtime mode" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Realtime mode" }),
    ).toHaveProperty("checked", false);
    await waitFor(() => expect(currentVoiceProvider()).toBe("live"));
  });

  test("a stored Brunch choice remains selectable and switching to Stock mounts nothing of Brunch", async () => {
    const incarnationId = "selection-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    flueClientMock.current = flueHistoryClient(incarnationId);
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    expect(currentAssistant().executeMutation).toBeUndefined();
    expect(localStorage.getItem(assistantSelectionStorageKey)).toBe("brunch");
    const brunchTransport = currentAssistant().transport;

    switchAssistant(/Use the stock Petrinaut assistant/);

    await waitFor(() => expect(currentAssistant().requestStop).toBeUndefined());
    const stock = currentAssistant();
    expect(stock.executeMutation).toBeUndefined();
    expect(stock.transport).not.toBe(brunchTransport);
    expect((defaultTransportOptions.current as { api: string }).api).toBe(
      "/api/chat",
    );
    expect(stock.automaticTools).toEqual([]);
    expect(stock.additionalTab).toBeUndefined();
    expect(stock.renderVoiceMode).toBeUndefined();
    expect(stock.requestStop).toBeUndefined();
    expect(stock.followMessages).toBeUndefined();
    expect(stock.canClearMessages).toBe(true);
    expect(localStorage.getItem(assistantSelectionStorageKey)).toBe("stock");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.queryByRole("button", { name: /Toggle Brunch demo mode/ }),
    ).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
  });

  test("defaults Voice on for saved Brunch, preserves an explicit opt-out, and removes it for Stock", async () => {
    seedStoredNet("voice-gating-incarnation");
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    flueClientMock.current = flueHistoryClient("voice-gating-incarnation");
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    vi.stubGlobal("fetch", fetch);
    const defaultView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
      expect(currentVoiceCapability()).toEqual({
        available: true,
        connectionTimeoutMs: 10_000,
      });
    });
    expect(currentAssistant().renderVoiceMode).toBeDefined();

    defaultView.unmount();
    localStorage.setItem(voicePreferenceStorageKey, "false");
    const disabledView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(currentVoiceCapability()).toBeDefined());
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    disabledView.unmount();
    localStorage.setItem(voicePreferenceStorageKey, "true");
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );
    renderedAssistants.length = 0;

    switchAssistant(/Use the stock Petrinaut assistant/);

    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant.renderVoiceMode === undefined,
      ),
    ).toBe(true);
    expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
  });

  test("does not render Voice when the persisted preference is on but capability is unavailable", async () => {
    const incarnationId = "unavailable-voice-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    localStorage.setItem(voicePreferenceStorageKey, "true");
    flueClientMock.current = flueHistoryClient(incarnationId);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ available: false }),
      ),
    );

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentVoiceCapability()).toBeNull());
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    expect(
      screen.getByRole("checkbox", { name: "Enable Voice" }),
    ).toHaveProperty("disabled", true);
    expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
  });

  test("clears cached Voice capability during each Stock to Brunch check", async () => {
    const incarnationId = "delayed-voice-capability-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "stock");
    localStorage.setItem(voicePreferenceStorageKey, "true");
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
    switchAssistant(/Use Brunch/);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(currentVoiceCapability()).toBeUndefined();
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
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

    switchAssistant(/Use the stock Petrinaut assistant/);
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeUndefined(),
    );
    renderedAssistants.length = 0;
    switchAssistant(/Use Brunch/);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(currentVoiceCapability()).toBeUndefined();
    expect(currentAssistant().renderVoiceMode).toBeUndefined();
    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant.renderVoiceMode === undefined,
      ),
    ).toBe(true);

    secondCapability.resolve(
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    await waitFor(() =>
      expect(currentAssistant().renderVoiceMode).toBeDefined(),
    );
  });

  test("each assistant keeps its own history: stock messages stay in the local store and are never handed to Brunch", async () => {
    const incarnationId = "history-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "stock");
    flueClientMock.current = flueHistoryClient(incarnationId);
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant()).toBeDefined());
    const stock = currentAssistant();
    expect(stock.executeMutation).toBeUndefined();

    const stockMessage = {
      id: "stock-1",
      role: "user",
      parts: [{ type: "text", text: "Stock assistant turn" }],
    } as PetrinautAiMessage;
    act(() => stock.onMessages?.([stockMessage]));
    await waitFor(() =>
      expect(currentAssistant().messages).toEqual([stockMessage]),
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut-ai-messages") ?? "{}"),
    ).toEqual({
      "net-1": [stockMessage],
    });

    switchAssistant(/Use Brunch/);
    await waitFor(() => expect(currentAssistant().requestStop).toBeDefined());
    const brunch = currentAssistant();
    expect(brunch.executeMutation).toBeUndefined();
    expect(brunch.messages ?? []).not.toContainEqual(stockMessage);
    act(() =>
      brunch.onMessages?.([
        { id: "brunch-1", role: "user", parts: [] } as PetrinautAiMessage,
      ]),
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut-ai-messages") ?? "{}"),
    ).toEqual({
      "net-1": [stockMessage],
    });

    switchAssistant(/Use the stock Petrinaut assistant/);
    await waitFor(() => expect(currentAssistant().requestStop).toBeUndefined());
    expect(currentAssistant().executeMutation).toBeUndefined();
    expect(currentAssistant().messages).toEqual([stockMessage]);
  });

  test("an absent replay baseline stays immutable when admission refresh publishes its live calls", async () => {
    const incarnationId = "live-baseline-incarnation";
    seedStoredNet(incarnationId);
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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

  test("a pending I mutation in history is not executed again after reload", async () => {
    seedStoredNet("pending-incarnation");
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
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
    const stock = currentAssistant();
    expect(stock.executeMutation).toBeUndefined();
    expect(stock.automaticTools).toEqual([]);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.queryByRole("button", {
        name: /stock Petrinaut assistant|Use Brunch/,
      }),
    ).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
  });
});
