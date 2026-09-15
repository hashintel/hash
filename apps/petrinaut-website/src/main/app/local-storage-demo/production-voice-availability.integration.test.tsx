/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type {
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

const brunchPreviewConfig = vi.hoisted(() => ({
  chatEndpoint: "/agents/chat",
  isBrunchConfigured: true,
}));

const flueClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => brunchPreviewConfig,
}));

vi.mock("./brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "test-principal",
}));

vi.mock("@flue/sdk", async (importOriginal) => {
  const original = await importOriginal<typeof import("@flue/sdk")>();
  return {
    ...original,
    createFlueClient: () => flueClient.current,
  };
});

vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@hashintel/petrinaut/ui")>();
  const inertWorker = () => ({
    addEventListener() {},
    postMessage() {},
    removeEventListener() {},
    terminate() {},
  });

  return {
    ...original,
    Petrinaut: (props: Parameters<typeof original.Petrinaut>[0]) => (
      <original.Petrinaut
        {...props}
        lspWorkerFactory={inertWorker}
        monteCarloWorkerFactory={inertWorker}
        simulationWorkerFactory={inertWorker}
      />
    ),
  };
});

const stubStorage = () => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()].at(index) ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
  localStorage.setItem(
    "petrinaut:user-settings",
    JSON.stringify({ showWalkthroughOnInit: false }),
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("renders the microphone action when Brunch and server Voice are available", async () => {
  stubStorage();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
  const snapshot: AgentConversationObservationSnapshot = {
    conversation: {
      conversationId: "production-voice",
      messages: [],
      settlements: [],
    },
    error: undefined,
    offset: "0",
    phase: "live",
  };
  flueClient.current = {
    observe: () => ({
      close: () => {},
      getSnapshot: () => snapshot,
      refresh: () => {},
      subscribe: () => () => {},
    }),
  } as Pick<FlueClient, "observe"> as FlueClient;
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ available: true, connectionTimeoutMs: 15_000 }),
  );
  vi.stubGlobal("fetch", fetch);

  render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/config",
      expect.objectContaining({ cache: "no-store", method: "GET" }),
    ),
  );
  expect(
    await screen.findByRole("button", { name: "Start voice mode" }),
  ).not.toBeNull();
});
