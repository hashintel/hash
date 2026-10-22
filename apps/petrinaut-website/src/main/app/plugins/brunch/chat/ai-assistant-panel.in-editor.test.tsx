/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadLanguageServer,
} from "../../../shared/petrinaut-jsdom";
import { AiAssistantPanel } from "./ai-assistant-panel";
import { AiVoiceModeIcon } from "./ai-voice-mode-button";

import type { PetrinautAiInputMode } from "./ai-assistant-composer-control";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel";
import type { PetrinautAiAssistant } from "./petrinaut";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

// Kept until the environment is disposed: the language server starts lazily.
beforeAll(async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  await preloadLanguageServer();
}, 30_000);

afterEach(cleanup);

const streamChunks = (chunks: UIMessageChunk[]) =>
  new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const textReply = (id: string, text: string): UIMessageChunk[] => [
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
  { type: "finish-step" },
  { type: "finish" },
];

const toolCall = (
  toolCallId: string,
  toolName: string,
  input: unknown,
): UIMessageChunk[] => [
  { type: "start" },
  { type: "start-step" },
  { type: "tool-input-available", dynamic: true, toolCallId, toolName, input },
  { type: "finish-step" },
  { type: "finish" },
];

/** A built-in tool call, which the chat runs itself once the reply settles. */
const staticToolCall = (
  toolCallId: string,
  toolName: string,
  input: unknown,
): UIMessageChunk[] => [
  { type: "start" },
  { type: "start-step" },
  { type: "tool-input-available", toolCallId, toolName, input },
  { type: "finish-step" },
  { type: "finish" },
];

/** Opens the panel and sends `text` from its composer. */
const sendFromComposer = async (text: string) => {
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Message AI assistant" }),
    { target: { value: text } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
};

const BrunchChatTestPlugin = definePetrinautPlugin({
  id: "test.brunch-chat",
  name: "Brunch chat test",
  description: "Renders Brunch's copied chat as its assistant content.",
  author: "HASH",
  access: { document: "write", experiments: "write", editor: "write" },
  assistant: true,
});

type ChatStart = { readonly text: string } | { readonly voice: true };

/**
 * A test plugin that draws Brunch's copied chat in the editor's real
 * assistant panel, with the empty-net prompt's text and Voice start, as the
 * Brunch plugin will after the cutover.
 */
const chatPlugin = (assistant: PetrinautAiAssistant): PetrinautPlugin => {
  const useChatPlugin: PluginHook<typeof BrunchChatTestPlugin> = (api) => {
    const [start, setStart] = useState<ChatStart | null>(null);
    const initialMessage = start && "text" in start ? start.text : null;
    const initialInteractionMode: PetrinautAiInputMode | null =
      start && "voice" in start ? "voice" : null;

    return {
      assistant: {
        content: (
          <AiAssistantPanel
            aiAssistant={assistant}
            api={api}
            initialMessage={initialMessage}
            onInitialMessageConsumed={() => setStart(null)}
            initialInteractionMode={initialInteractionMode}
            onInitialInteractionModeConsumed={() => setStart(null)}
          />
        ),
        onPrompt: (text) => setStart({ text }),
        ...(assistant.renderVoiceMode && {
          startAction: {
            label: "Start voice mode",
            icon: <AiVoiceModeIcon size={20} />,
            run: () => setStart({ voice: true }),
          },
        }),
      },
    };
  };

  return BrunchChatTestPlugin(useChatPlugin);
};

const emptyNet = { places: [], transitions: [] };

const renderChat = (
  assistant: (handle: PetrinautDocHandle) => PetrinautAiAssistant,
  { readonly = false }: { readonly?: boolean } = {},
) => {
  const handle = createJsonDocHandle({ initial: emptyNet });
  render(
    <Petrinaut
      handle={handle}
      plugins={[chatPlugin(assistant(handle))]}
      readonly={readonly}
    />,
  );

  return { handle };
};

const transportOf = (
  replies: UIMessageChunk[][],
): PetrinautAiTransport & {
  readonly requests: PetrinautAiMessage[][];
} => {
  const requests: PetrinautAiMessage[][] = [];
  return {
    requests,
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: ({ messages }) => {
      requests.push(structuredClone(messages));
      const reply = replies[requests.length - 1] ?? textReply("idle", "");
      return Promise.resolve(streamChunks(reply));
    },
  };
};

const userTexts = (messages: PetrinautAiMessage[] | undefined) =>
  (messages ?? [])
    .filter(({ role }) => role === "user")
    .flatMap(({ parts }) =>
      parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    );

test("sends the empty-net prompt once through the chat's composer path in the editor's panel", async () => {
  const transport = transportOf([textReply("reply", "Drafted the queue.")]);
  renderChat(() => ({ presentation: "brunch", transport }));

  fireEvent.change(
    await screen.findByRole("textbox", {
      name: "Describe the process you want to create",
    }),
    { target: { value: "A queue" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Send first AI assistant message" }),
  );

  await screen.findByText("Drafted the queue.", {}, { timeout: 4_000 });
  expect(transport.requests).toHaveLength(1);
  expect(userTexts(transport.requests[0])).toEqual(["A queue"]);
  const panel = screen.getByRole("complementary", { name: "AI assistant" });
  // The chat fills the editor's own panel: its title bar and composer.
  expect(
    within(panel).getByRole("textbox", { name: "Message AI assistant" }),
  ).toBeTruthy();
  expect(
    within(panel).getByRole("button", { name: "Close AI assistant" }),
  ).toBeTruthy();
});

test("runs automatic tools against the editor through refusal-aware plugin edits", async () => {
  const place = {
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  };
  const run = async (readonly: boolean) => {
    const transport = transportOf([
      toolCall("add-queue", "hostAddPlace", place),
      textReply("done", "Tool settled."),
    ]);
    const passthrough = { parse: (raw: unknown) => raw };
    const { handle } = renderChat(
      (documentHandle) => ({
        presentation: "brunch",
        documentHandle,
        automaticTools: [
          {
            toolName: "hostAddPlace",
            inputSchema: passthrough,
            outputSchema: passthrough,
            execute: ({ edit, handle: boundHandle }) => {
              expect(boundHandle).toBe(documentHandle);
              return edit.addPlace(
                place as Parameters<typeof edit.addPlace>[0],
              );
            },
          },
        ],
        transport,
      }),
      { readonly },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Message AI assistant" }),
      { target: { value: "Add a queue" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Tool settled.", {}, { timeout: 4_000 });
    const output = transport.requests[1]
      ?.flatMap(({ parts }) => parts)
      .find(
        (part) =>
          part.type === "dynamic-tool" && part.toolCallId === "add-queue",
      );
    cleanup();
    return { output, places: handle.doc()?.places.length };
  };

  const editable = await run(false);
  expect(editable.output).toMatchObject({
    state: "output-available",
    output: { applied: true },
  });
  expect(editable.places).toBe(1);

  const readOnly = await run(true);
  expect(readOnly.output).toMatchObject({
    state: "output-available",
    output: { applied: false, reason: { kind: "host-readonly" } },
  });
  expect(readOnly.places).toBe(0);
});

test("refuses layout on a read-only net before asking for consent", async () => {
  const transport = transportOf([
    staticToolCall("read-only-layout", "applyAutoLayout", {
      askUserFirst: true,
    }),
    textReply("done", "Layout refused."),
  ]);
  renderChat(() => ({ presentation: "brunch", transport }), {
    readonly: true,
  });

  await sendFromComposer("Tidy the layout");

  await screen.findByText("Layout refused.", {}, { timeout: 4_000 });
  expect(screen.queryByRole("button", { name: "Yes, auto-layout" })).toBeNull();
  expect(
    transport.requests[1]
      ?.flatMap(({ parts }) => parts)
      .find(
        (part) =>
          part.type === "tool-applyAutoLayout" &&
          part.toolCallId === "read-only-layout",
      ),
  ).toMatchObject({
    state: "output-available",
    output: { applied: false, blocked: "host-readonly" },
  });
});

test("refuses a static mutation on a read-only net before its host boundary runs", async () => {
  const transport = transportOf([
    staticToolCall("read-only-place", "addPlace", {
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    }),
    textReply("done", "Place refused."),
  ]);
  const executeMutation = vi.fn<
    NonNullable<PetrinautAiAssistant["executeMutation"]>
  >(({ execute }) => execute());
  const { handle } = renderChat(
    () => ({ presentation: "brunch", transport, executeMutation }),
    { readonly: true },
  );

  await sendFromComposer("Add a queue");

  await screen.findByText("Place refused.", {}, { timeout: 4_000 });
  expect(executeMutation).not.toHaveBeenCalled();
  expect(handle.doc()?.places).toEqual([]);
  expect(
    transport.requests[1]
      ?.flatMap(({ parts }) => parts)
      .find(
        (part) =>
          part.type === "tool-addPlace" &&
          part.toolCallId === "read-only-place",
      ),
  ).toMatchObject({
    state: "output-available",
    output: { applied: false, blocked: "host-readonly" },
  });
});

test("starts Voice from the empty-net prompt collapsed, expands, and pauses before the panel's Close", async () => {
  const events: string[] = [];
  let panelOpenAtPause: boolean | undefined;
  const VoiceMode = ({
    registerVoiceModeControls,
    isAiAssistantOpen,
    inputMode,
  }: Parameters<NonNullable<PetrinautAiAssistant["renderVoiceMode"]>>[0]) => {
    useEffect(
      () =>
        registerVoiceModeControls({
          end: async () => {
            events.push("end");
          },
          pause: () => {
            events.push("pause");
            panelOpenAtPause =
              document
                .querySelector('aside[aria-label="AI assistant"]')
                ?.hasAttribute("inert") === false;
          },
          reconnect: () => {},
          resume: () => {},
          setMicrophoneMuted: () => {},
        }),
      [registerVoiceModeControls],
    );
    return (
      <p>{`Voice ${inputMode} ${isAiAssistantOpen ? "open" : "closed"}`}</p>
    );
  };
  renderChat(() => ({
    presentation: "brunch",
    transport: transportOf([]),
    renderVoiceMode: (context) => <VoiceMode {...context} />,
  }));

  fireEvent.click(
    await screen.findByRole("button", { name: "Start voice mode" }),
  );

  // Voice opens the panel collapsed to its corner dock. jsdom applies no
  // stylesheet, so the hidden title bar shows as the panel's hiding class.
  const titleBarOf = () =>
    screen
      .getByRole("button", { hidden: true, name: "Close AI assistant" })
      .closest("div");
  const setupDock = await screen.findByRole("region", { name: "Voice setup" });
  expect(screen.getByText("Voice voice open")).toBeTruthy();
  expect(titleBarOf()?.className).toContain("d_none");

  fireEvent.click(
    within(setupDock).getByRole("button", { name: "Expand voice setup" }),
  );
  await waitFor(() => expect(titleBarOf()?.className).not.toContain("d_none"));
  const close = screen.getByRole("button", { name: "Close AI assistant" });
  expect(screen.queryByRole("region", { name: "Voice setup" })).toBeNull();

  act(() => close.click());

  expect(events).toEqual(["pause"]);
  // The chat paused Voice in the Close press itself, while the panel was open.
  expect(panelOpenAtPause).toBe(true);
  // Closed, the panel leaves the accessibility tree and turns inert.
  await waitFor(() =>
    expect(
      document
        .querySelector('aside[aria-label="AI assistant"]')
        ?.hasAttribute("inert"),
    ).toBe(true),
  );
  expect(screen.getByText("Voice voice closed")).toBeTruthy();
});
