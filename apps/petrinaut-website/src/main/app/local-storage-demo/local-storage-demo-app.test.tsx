/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { defaultPetrinautNavigationHistoryPolicy } from "@hashintel/petrinaut/react";

import { VoiceInterviewControl } from "../voice-interview/voice-interview-control";
import {
  getBrunchVoiceMode,
  LocalStorageDemoApp,
} from "./local-storage-demo-app";

import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";

const defaultTransportOptions = vi.hoisted(() => ({
  current: null as unknown,
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
    const voiceMode = getBrunchVoiceMode(config);
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
    expect(control).toMatchObject({
      props: { config },
      type: VoiceInterviewControl,
    });
  });

  test("correlates the existing Brunch transport request", () => {
    const options = defaultTransportOptions.current as {
      readonly headers: () => Record<string, string>;
    };

    expect(options.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
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
});
