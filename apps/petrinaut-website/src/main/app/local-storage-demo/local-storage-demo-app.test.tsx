/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FlueChatAdmissionError } from "@hashintel/brunch-agent-transport-aisdk";
import { defaultPetrinautNavigationHistoryPolicy } from "@hashintel/petrinaut/react";

import { OpenAIRealtimeSession } from "../voice-interview/openai-realtime-session";
import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";
import { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import {
  getBrunchVoiceMode,
  LocalStorageDemoApp,
  requestFlueStop,
} from "./local-storage-demo-app";

import type {
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";
import type { PetrinautAiAssistant } from "@hashintel/petrinaut/ui";

const defaultTransportOptions = vi.hoisted(() => ({
  current: null as unknown,
}));
const flueClientMock = vi.hoisted(() => ({ current: null as unknown }));
const renderedPetrinaut = vi.hoisted(() => ({ aiAssistant: null as unknown }));

vi.mock("@flue/sdk", () => ({
  createFlueClient: () => flueClientMock.current,
}));

vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => ({
    chatEndpoint: "/agents/chat",
    isBrunchConfigured: true,
  }),
}));

const editorProps = vi.hoisted(() => ({
  current: null as {
    navigation?: unknown;
    createNewNet?: (params: {
      petriNetDefinition: unknown;
      title: string;
    }) => void;
  } | null,
}));

vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));

vi.mock("@hashintel/petrinaut/ui", () => ({
  DefaultChatTransport: class {
    public constructor(options: unknown) {
      defaultTransportOptions.current = options;
    }
  },
  Petrinaut: (props: Record<string, unknown>) => {
    editorProps.current = props;
    renderedPetrinaut.aiAssistant = props.aiAssistant;
    return null;
  },
  WalkthroughProvider: ({ children }: { children: ReactNode }) => children,
  definePetrinautAiInteractiveTool: (definition: unknown) => definition,
}));

describe("local storage demo Brunch voice integration", () => {
  test("does not install voice on the generic local chat fallback", () => {
    expect(getBrunchVoiceMode(null)).toBeUndefined();
  });

  test("installs the app-owned voice control for a configured Brunch transport", () => {
    const config = { available: true as const, connectionTimeoutMs: 15_000 };
    const tracker = new BrunchPanelConversationTracker();
    const voiceMode = getBrunchVoiceMode(config, tracker);
    const control = voiceMode?.({
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

    expect(isValidElement(control)).toBe(true);
    if (!isValidElement(control)) {
      throw new Error("Expected the configured composer control to render.");
    }
    const failureListener = vi.fn();
    const responseCompletedListener = vi.fn();
    const responseStartedListener = vi.fn();
    const stopListener = vi.fn();
    const target = { kind: "user" as const, messageId: "voice-turn-1" };
    const controlProps = control.props as {
      config: typeof config;
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
    expect(aiAssistant.interactiveTools).toEqual([]);
    expect(
      aiAssistant.interactiveTools?.some(
        ({ toolName }) => toolName === "brunch_ask",
      ),
    ).toBe(false);

    rendered.unmount();
    vi.unstubAllGlobals();
  });

  test("keeps durable Flue Stop distinct from local playback cancellation", async () => {
    renderedPetrinaut.aiAssistant = null;
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

const seedStoredNet = () => {
  stubStorage();
  localStorage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      "net-1": {
        id: "net-1",
        title: "Seeded net",
        lastUpdated: "2020-01-01T00:00:00.000Z",
        sdcpn: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
      },
    }),
  );
};

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
      { history: "push", intent: { cause: "user", action: "subnet" } },
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
