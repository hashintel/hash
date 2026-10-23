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

import { canonicalContent } from "@hashintel/brunch-agent";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import { createInBandBrowserCalls } from "../../client/tools/in-band-browser-call";
import { BrunchAssistantContext, brunchPlugin } from "../editor-api-plugin";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadLanguageServer,
} from "../testing/petrinaut-jsdom";
import { AiAssistantPanel } from "./ai-assistant-panel";

import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel";
import type { PetrinautAiAssistant } from "./petrinaut";
import type { FlueClient } from "@flue/sdk";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../testing/petrinaut-jsdom");
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

/**
 * A test plugin that draws Brunch's copied chat in the editor's real
 * assistant panel, with the empty-net prompt's text, as the Brunch plugin
 * does.
 */
const chatPlugin = (assistant: PetrinautAiAssistant): PetrinautPlugin => {
  const useChatPlugin: PluginHook<typeof BrunchChatTestPlugin> = (api) => {
    const [promptText, setPromptText] = useState<string | null>(null);

    return {
      assistant: {
        content: (
          <AiAssistantPanel
            aiAssistant={assistant}
            api={api}
            initialMessage={promptText}
            onInitialMessageConsumed={() => setPromptText(null)}
            initialInteractionMode={promptText === null ? null : "text"}
            onInitialInteractionModeConsumed={() => setPromptText(null)}
          />
        ),
        onPrompt: setPromptText,
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

test("starts Voice from the composer in the editor's panel and pauses it when the panel closes", async () => {
  // Controls are spies, not closures over test state: the React Compiler
  // hoists a closure the component doesn't capture out of the test's scope.
  const endVoice = vi.fn(async () => {});
  const pauseVoice = vi.fn();
  const VoiceMode = ({
    registerVoiceModeControls,
    isAiAssistantOpen,
    inputMode,
  }: Parameters<NonNullable<PetrinautAiAssistant["renderVoiceMode"]>>[0]) => {
    useEffect(
      () =>
        registerVoiceModeControls({
          end: endVoice,
          pause: pauseVoice,
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

  // The empty-net prompt offers text only; Voice starts inside the panel.
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );
  const panel = await screen.findByRole("complementary", {
    name: "AI assistant",
  });
  fireEvent.click(
    within(panel).getByRole("button", { name: "Start voice mode" }),
  );
  expect(await screen.findByText("Voice voice open")).toBeTruthy();
  expect(pauseVoice).not.toHaveBeenCalled();

  act(() => screen.getByRole("button", { name: "Close AI assistant" }).click());

  // Closed, the panel leaves the accessibility tree and turns inert; its
  // content stays mounted and pauses Voice.
  await waitFor(() =>
    expect(
      document
        .querySelector('aside[aria-label="AI assistant"]')
        ?.hasAttribute("inert"),
    ).toBe(true),
  );
  expect(pauseVoice).toHaveBeenCalledOnce();
  expect(endVoice).not.toHaveBeenCalled();
  expect(screen.getByText("Voice voice closed")).toBeTruthy();
});

test("a call claimed in one editor never runs in a replacement with identical content, and posts no result (T1)", async () => {
  const place = {
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  };
  const binding = { conversationId: "conversation", documentId: "net" };
  const requests: { readonly method: string; readonly url: string }[] = [];
  // The Brunch server, as the browser calls see it: a claim is granted, and
  // a result or failure is accepted.
  const brunchFetch = vi.fn<typeof fetch>(async (url, init) => {
    const method = init?.method ?? "GET";
    requests.push({
      method,
      url: url instanceof Request ? url.url : url.toString(),
    });
    return method === "GET"
      ? Response.json({
          capability: "capability",
          binding: canonicalContent(binding),
          toolName: "addPlace",
          input: place,
        })
      : new Response(null, { status: 200 });
  });
  // The first editor's call waits at admission, after its claim, until the
  // editor has been replaced.
  let admit = () => {};
  const admission = new Promise<void>((resolve) => {
    admit = resolve;
  });
  const ranOn: PetrinautDocHandle[] = [];
  /** Whether each in-band run was already stopped when it reached its tool. */
  const reachedToolStopped: boolean[] = [];
  const passthrough = { parse: (raw: unknown) => raw };
  const assistantFor = (
    documentHandle: PetrinautDocHandle,
    history: {
      readonly transport: PetrinautAiTransport;
      readonly messages: PetrinautAiMessage[];
      readonly waitForAdmission: boolean;
    },
  ): PetrinautAiAssistant => {
    const calls = createInBandBrowserCalls({
      client: Promise.resolve({
        url: "http://brunch.local/agents/petrinaut/instance",
      } as FlueClient),
      ownerKey: "owner",
      fetch: brunchFetch,
      binding,
      metadataFor: () => undefined,
      prepareInput: () => {},
      ...(history.waitForAdmission
        ? { admit: () => admission.then(() => ({ admitted: true }) as const) }
        : {}),
      // The replacement holds the same content, so its revision matches.
      acceptsRevision: () => true,
    });
    return {
      presentation: "brunch",
      conversationId: binding.conversationId,
      transport: history.transport,
      // Brunch's history arrives as followed messages.
      messages: history.messages,
      followMessages: { canReplace: () => true },
      documentHandle,
      automaticTools: [
        {
          toolName: "addPlace",
          inputSchema: passthrough,
          outputSchema: passthrough,
          execute: ({ edit, handle }) => {
            ranOn.push(handle);
            return edit.addPlace(place as Parameters<typeof edit.addPlace>[0]);
          },
        },
      ],
      inBandBrowserTools: {
        has: calls.has,
        run: (call, execute) =>
          calls.run(call, (input) => {
            reachedToolStopped.push(call.signal.aborted);
            return execute(input);
          }),
      },
    };
  };

  const firstHandle = createJsonDocHandle({ initial: emptyNet });
  const firstTransport = transportOf([toolCall("add", "addPlace", place)]);
  const { rerender } = render(
    <BrunchAssistantContext
      value={assistantFor(firstHandle, {
        transport: firstTransport,
        messages: [],
        waitForAdmission: true,
      })}
    >
      <Petrinaut handle={firstHandle} plugins={[brunchPlugin]} />
    </BrunchAssistantContext>,
  );
  await sendFromComposer("Add a queue");
  await waitFor(() =>
    expect(requests).toEqual([
      {
        method: "GET",
        url: expect.stringContaining("/browser-calls/add?binding=") as string,
      },
    ]),
  );

  // The host loads the same saved net again, into a new handle. The
  // replacement's history shows the call, still pending.
  const secondHandle = createJsonDocHandle({ initial: emptyNet });
  const secondTransport = transportOf([]);
  rerender(
    <BrunchAssistantContext
      value={assistantFor(secondHandle, {
        transport: secondTransport,
        messages: [
          ...(firstTransport.requests[0] ?? []),
          {
            id: "turn",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolName: "addPlace",
                toolCallId: "add",
                state: "input-available",
                input: place,
              },
            ],
          },
        ],
        waitForAdmission: false,
      })}
    >
      <Petrinaut handle={secondHandle} plugins={[brunchPlugin]} />
    </BrunchAssistantContext>,
  );
  // Open the replacement's panel, if it isn't open already, on the same
  // conversation.
  const show = screen.queryByRole("button", { name: "Show AI assistant" });
  if (show !== null) fireEvent.click(show);
  await screen.findByRole("textbox", { name: "Message AI assistant" });
  admit();
  await waitFor(() => expect(reachedToolStopped).toEqual([true]));
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

  expect(secondHandle.id).not.toBe(firstHandle.id);
  // The replacement never claims or runs the call.
  expect(ranOn).not.toContain(secondHandle);
  expect(secondHandle.doc()?.places).toEqual([]);
  expect(secondTransport.requests).toEqual([]);
  // The first editor's run, stopped with its editor, posts no result and no
  // failure: the claim is the only request.
  expect(requests).toHaveLength(1);
});
