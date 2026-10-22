/** @vitest-environment jsdom */

import { FlueApiError, type FlueClient } from "@flue/sdk";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
import { startEmptyNetInStorage } from "./use-local-storage-sdcpns";
import { wordsPreferenceStorageKey } from "./words-preference";

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
