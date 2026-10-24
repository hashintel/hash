/** @vitest-environment jsdom */

import { FlueApiError, type FlueClient } from "@flue/sdk";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ComponentProps, useEffect, useState } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { parsePetrinautUserMessageBody } from "@hashintel/brunch-agent";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "../plugins/brunch/conversation/brunch-conversation-id";
import { conversationWordsKey } from "../plugins/brunch/words/conversation-words";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "../shared/petrinaut-jsdom";
import { assistantSelectionStorageKey } from "./assistant-selection";
import { LocalStorageDemoApp } from "./local-storage-demo-app";
import {
  saveNetInStorage,
  startEmptyNetInStorage,
} from "./use-local-storage-sdcpns";
import { wordsPreferenceStorageKey } from "./words-preference";

import type { PetrinautProps } from "@hashintel/petrinaut/ui";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const client = vi.hoisted(() => ({
  current: null as unknown,
  create: vi.fn(),
}));
vi.mock("@flue/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flue/sdk")>()),
  createFlueClient: (
    options: Parameters<typeof import("@flue/sdk").createFlueClient>[0],
  ) => {
    client.create(options);
    return client.current;
  },
}));
vi.mock("../plugins/brunch/brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => ({
    chatEndpoint: "/agents/petrinaut",
    isBrunchConfigured: true,
  }),
}));
vi.mock("../plugins/brunch/conversation/brunch-principal", () => ({
  getOrCreateBrunchPrincipal: () => "prompt-test-principal",
}));
// The real editor, observed: the props the shell hands it.
const editorProps = vi.hoisted(() => ({
  current: null as PetrinautProps | null,
}));
vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/petrinaut/ui")>();
  return {
    ...actual,
    Petrinaut: (props: ComponentProps<typeof actual.Petrinaut>) => {
      editorProps.current = props;
      return <actual.Petrinaut {...props} />;
    },
  };
});

beforeAll(preloadMonaco, 30_000);
// Keep the platform shims until the environment is disposed: the language
// server starts lazily and can finish loading after the editor unmounts.
afterEach(cleanup);

test("empty-canvas and composer text share one Brunch conversation and its budget and words", async () => {
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
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ available: false })),
  );
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(
    "petrinaut:plugin:website.walkthrough",
    JSON.stringify({ showOnInit: false }),
  );
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  localStorage.setItem("petrinaut-website:interview-budget-enabled", "true");
  localStorage.setItem("petrinaut-website:interview-budget", "quick");
  localStorage.setItem(wordsPreferenceStorageKey, "true");
  const conversationId = brunchEvaluationConversationIdFrom(
    ordinaryConstructionConversationIdFrom(netId),
  );
  localStorage.setItem(
    conversationWordsKey("prompt-test-principal", conversationId),
    JSON.stringify({
      version: 1,
      entries: [
        { id: "word-1", spelling: "RelayDesk", pronunciation: "relay desk" },
      ],
    }),
  );
  // Refuse admission at the network boundary: no paid model call, and the
  // editor must surface the failure without duplicating the prompt.
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(400, "Prompt test refusal");
  });
  client.current = {
    send,
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  render(
    <LocalStorageDemoApp
      netId={netId}
      onOpenNet={() => {}}
      onSearchChange={() => {}}
      search={{}}
    />,
  );

  const prompt = await screen.findByRole("textbox", {
    name: "Describe the process you want to create",
  });
  fireEvent.change(prompt, { target: { value: "Model RelayDesk" } });
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Send first AI assistant message" }),
    ),
  );
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const initialBody = parsePetrinautUserMessageBody(
    send.mock.calls[0]?.[0].message.body ?? "",
  );
  expect(initialBody).toMatchObject({
    kind: "contextual",
    userText: "Model RelayDesk",
    submissionContext: {
      interviewBudget: {
        level: "quick",
        questionCap: 3,
        asked: 0,
        remaining: 3,
      },
      words: ["RelayDesk"],
    },
  });
  expect(send.mock.calls[0]?.[0].initialData).toMatchObject({
    binding: { documentId: netId, conversationId },
  });
  expect(
    await screen.findByText(
      "The agent rejected the message before admission (HTTP 400).",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Model RelayDesk", { selector: "div" })).toBeTruthy();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" })),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" })),
  );
  expect(send).toHaveBeenCalledOnce();
  expect(screen.getByText("Model RelayDesk", { selector: "div" })).toBeTruthy();

  fireEvent.change(
    screen.getByRole("textbox", { name: "Message AI assistant" }),
    { target: { value: "Add a queue" } },
  );
  await act(async () =>
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
      { key: "Enter", code: "Enter" },
    ),
  );
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(
    parsePetrinautUserMessageBody(send.mock.calls[1]?.[0].message.body ?? ""),
  ).toMatchObject({
    kind: "contextual",
    userText: "Add a queue",
    submissionContext:
      initialBody.kind === "contextual"
        ? initialBody.submissionContext
        : undefined,
  });
  expect(send.mock.calls[1]?.[0].initialData).toEqual(
    send.mock.calls[0]?.[0].initialData,
  );
  expect(client.create).toHaveBeenCalledOnce();
});

/**
 * A browser for the real shell: empty in-memory storage, the platform shims,
 * and a server whose `/api/voice/config` says whether it offers Voice. Any
 * other request fails, so nothing reaches a model or an audio service.
 */
const stubBrowser = ({ voice = false }: { voice?: boolean } = {}) => {
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
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (url !== "/api/voice/config") {
        throw new Error(`Unexpected fetch ${String(url)}`);
      }
      return Response.json(
        voice
          ? { available: true, connectionTimeoutMs: 10_000 }
          : { available: false },
      );
    }),
  );
  localStorage.setItem(
    "petrinaut:plugin:website.walkthrough",
    JSON.stringify({ showOnInit: false }),
  );
};

/** A Flue client that refuses every message at admission, as the first test's does. */
const refusingFlueClient = () => {
  client.create.mockClear();
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(400, "Prompt test refusal");
  });
  client.current = {
    send,
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  };
  return send;
};

const refusalNotice =
  "The agent rejected the message before admission (HTTP 400).";

const pluginIds = () =>
  editorProps.current?.plugins?.map(({ manifest }) => manifest.id) ?? [];

/** Opens a net in the mounted shell, as its route would. */
const openNet = { current: (_netId: string): void => {} };

/** The shell as its route mounts it, following its own requests to open another net. */
const Shell = ({ initialNetId }: { initialNetId: string }) => {
  const [netId, setNetId] = useState(initialNetId);
  useEffect(() => {
    openNet.current = setNetId;
  }, []);
  return (
    <LocalStorageDemoApp
      netId={netId}
      onOpenNet={setNetId}
      onSearchChange={() => {}}
      search={{}}
    />
  );
};

const sendFirstPrompt = async (text: string) => {
  fireEvent.change(
    await screen.findByRole("textbox", {
      name: "Describe the process you want to create",
    }),
    { target: { value: text } },
  );
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Send first AI assistant message" }),
    ),
  );
};

/**
 * Opens the assistant panel from the toolbar and starts Voice from the
 * composer's control, where Brunch offers it.
 */
const startVoiceInPanel = async () => {
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    ),
  );
  const panel = await screen.findByRole("complementary", {
    name: "AI assistant",
  });
  // Offered once the shell has checked the server's Voice configuration.
  const startVoice = await within(panel).findByRole("button", {
    name: "Start voice mode",
  });
  await act(async () => fireEvent.click(startVoice));
};

const bindingOf = (send: ReturnType<typeof refusingFlueClient>, call: number) =>
  (send.mock.calls[call]?.[0].initialData as { binding?: unknown } | undefined)
    ?.binding;

test("a saved Brunch choice makes Brunch's plugin the editor's assistant, with Petrinaut AI beside it", async () => {
  stubBrowser();
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  refusingFlueClient();
  render(<Shell initialNetId={netId} />);

  await screen.findByRole("textbox", {
    name: "Describe the process you want to create",
  });
  expect(pluginIds()).toEqual(
    expect.arrayContaining(["website.brunch", "website.petrinaut-ai"]),
  );
  expect(
    editorProps.current?.plugins?.find(
      ({ manifest }) => manifest.id === "website.brunch",
    )?.manifest,
  ).toMatchObject({ assistant: true, access: { document: "write" } });

  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" })),
  );
  const panel = screen.getByRole("complementary", { name: "AI assistant" });
  // Brunch's chat, with its Ledger beside the transcript, fills the panel.
  expect(within(panel).getByRole("tab", { name: /Ledger/u })).toBeTruthy();
  expect(
    within(panel).getByRole("textbox", { name: "Message AI assistant" }),
  ).toBeTruthy();
});

test("with Stock saved, Petrinaut AI is the assistant, and Brunch is listed without connecting or offering Voice", async () => {
  stubBrowser({ voice: true });
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(assistantSelectionStorageKey, "stock");
  refusingFlueClient();
  render(<Shell initialNetId={netId} />);

  await screen.findByRole("textbox", {
    name: "Describe the process you want to create",
  });
  expect(pluginIds()).toEqual(
    expect.arrayContaining(["website.brunch", "website.petrinaut-ai"]),
  );
  expect(screen.queryByRole("button", { name: "Start voice mode" })).toBeNull();
  expect(client.create).not.toHaveBeenCalled();
});

test("Brunch's Voice starts from its composer in the open panel, and closes and reopens without sending", async () => {
  stubBrowser({ voice: true });
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  // Realtime asks for consent before it starts a session: no audio, no network.
  localStorage.setItem("petrinaut-website:realtime-enabled", "true");
  const send = refusingFlueClient();
  render(<Shell initialNetId={netId} />);
  await vi.waitFor(() =>
    expect(fetch).toHaveBeenCalledWith("/api/voice/config", expect.anything()),
  );

  await screen.findByRole("textbox", {
    name: "Describe the process you want to create",
  });
  await startVoiceInPanel();
  expect(await screen.findByLabelText("Voice mode consent")).toBeTruthy();

  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" })),
  );
  await vi.waitFor(() =>
    expect(
      document
        .querySelector('aside[aria-label="AI assistant"]')
        ?.hasAttribute("inert"),
    ).toBe(true),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Show AI assistant" })),
  );
  expect(
    document
      .querySelector('aside[aria-label="AI assistant"]')
      ?.hasAttribute("inert"),
  ).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test("Brunch's Voice starts from the empty-net prompt, in the panel it opens", async () => {
  stubBrowser({ voice: true });
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  // Realtime asks for consent before it starts a session: no audio, no network.
  localStorage.setItem("petrinaut-website:realtime-enabled", "true");
  const send = refusingFlueClient();
  render(<Shell initialNetId={netId} />);

  // The prompt offers Voice once the server's Voice check answers.
  const startVoice = await screen.findByRole(
    "button",
    { name: "Start voice mode" },
    { timeout: 5_000 },
  );
  await act(async () => fireEvent.click(startVoice));

  expect(await screen.findByLabelText("Voice mode consent")).toBeTruthy();
  expect(
    document
      .querySelector('aside[aria-label="AI assistant"]')
      ?.hasAttribute("inert"),
  ).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test.each(
  (["the title bar's Close", "the toolbar"] as const).flatMap((closePath) =>
    (["Realtime", "Live"] as const).map((provider) => ({
      closePath,
      provider,
    })),
  ),
)(
  "$provider: text from the empty-net prompt after Voice was closed through $closePath is sent once as text",
  async ({ closePath, provider }) => {
    stubBrowser({ voice: true });
    const { id: netId } = startEmptyNetInStorage(localStorage);
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    // Either provider asks for consent before it starts a session: no audio,
    // no network.
    localStorage.setItem(
      "petrinaut-website:realtime-enabled",
      String(provider === "Realtime"),
    );
    // Interview length differs by input mode, so the budget shows which mode
    // the prompt's text was sent in: Quick allows three typed questions, two
    // spoken ones.
    localStorage.setItem("petrinaut-website:interview-budget-enabled", "true");
    localStorage.setItem("petrinaut-website:interview-budget", "quick");
    const send = refusingFlueClient();
    render(<Shell initialNetId={netId} />);
    await startVoiceInPanel();
    await screen.findByLabelText("Voice mode consent");

    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name:
            closePath === "the toolbar"
              ? "Hide AI assistant"
              : "Close AI assistant",
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('aside[aria-label="AI assistant"]')
          ?.hasAttribute("inert"),
      ).toBe(true),
    );

    // The prompt is back on the still-empty net; typed text is plain text,
    // as the built-in chat's prompt sent it, never a Voice handoff.
    await sendFirstPrompt("Model a queue");
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(
      parsePetrinautUserMessageBody(send.mock.calls[0]?.[0].message.body ?? ""),
    ).toMatchObject({
      userText: "Model a queue",
      submissionContext: {
        interviewBudget: { level: "quick", questionCap: 3 },
      },
    });
    expect(await screen.findByText(refusalNotice)).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
    ).toBeTruthy();
    expect(send).toHaveBeenCalledOnce();
  },
);

test("opening another net gives it its own Brunch conversation, without resending or showing the first net's messages", async () => {
  stubBrowser();
  const { id: firstNetId } = startEmptyNetInStorage(localStorage);
  const { id: secondNetId } = saveNetInStorage(localStorage, {
    petriNetDefinition: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
    title: "Second process",
  });
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  const send = refusingFlueClient();
  render(<Shell initialNetId={firstNetId} />);

  await sendFirstPrompt("Model the first queue");
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(bindingOf(send, 0)).toMatchObject({ documentId: firstNetId });
  expect(await screen.findByText(refusalNotice)).toBeTruthy();

  await act(async () => openNet.current(secondNetId));
  await vi.waitFor(() =>
    expect(editorProps.current?.title).toBe("Second process"),
  );
  // The shell shows its loading state while the next net's handle opens, so
  // the editor mounts afresh on it: panel closed, the empty-net prompt shown.
  await sendFirstPrompt("Model the second queue");
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(bindingOf(send, 1)).toMatchObject({ documentId: secondNetId });
  expect(
    screen.getByText("Model the second queue", { selector: "div" }),
  ).toBeTruthy();
  expect(
    screen.queryByText("Model the first queue", { selector: "div" }),
  ).toBeNull();

  await act(async () => openNet.current(firstNetId));
  await vi.waitFor(() =>
    expect(editorProps.current?.title).not.toBe("Second process"),
  );
  expect(
    screen.queryByText("Model the second queue", { selector: "div" }),
  ).toBeNull();
  expect(send).toHaveBeenCalledTimes(2);
  // One client per opened net: the first net's conversation again, not the
  // second's.
  const clientUrls = client.create.mock.calls.map(
    ([options]) => (options as { url: string }).url,
  );
  expect(clientUrls).toHaveLength(3);
  expect(clientUrls[2]).toBe(clientUrls[0]);
  expect(clientUrls[1]).not.toBe(clientUrls[0]);
});

test("switching to Petrinaut AI and back through the palette hands the panel over without resending Brunch's first prompt", async () => {
  stubBrowser();
  const { id: netId } = startEmptyNetInStorage(localStorage);
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  const send = refusingFlueClient();
  render(<Shell initialNetId={netId} />);
  await sendFirstPrompt("Model a queue");
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(await screen.findByText(refusalNotice)).toBeTruthy();
  // The refusal is an editor notification, which outlives the assistant; the
  // conversation is the panel's.
  const panel = () =>
    screen.getByRole("complementary", { hidden: true, name: "AI assistant" });
  expect(
    within(panel()).getByText("Model a queue", { selector: "div" }),
  ).toBeTruthy();

  const runPaletteCommand = async (label: string) => {
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    const palette = await screen.findByRole("dialog", {
      name: "Command palette",
    });
    await act(async () => fireEvent.click(within(palette).getByText(label)));
  };

  await runPaletteCommand("Use Petrinaut AI as the AI assistant");
  await vi.waitFor(() =>
    expect(
      within(panel()).queryByText("Model a queue", { selector: "div" }),
    ).toBeNull(),
  );
  expect(within(panel()).queryByRole("tab", { name: /Ledger/u })).toBeNull();

  await runPaletteCommand("Use Brunch as the AI assistant");
  await vi.waitFor(() =>
    expect(within(panel()).getByRole("tab", { name: /Ledger/u })).toBeTruthy(),
  );
  expect(send).toHaveBeenCalledOnce();
});
