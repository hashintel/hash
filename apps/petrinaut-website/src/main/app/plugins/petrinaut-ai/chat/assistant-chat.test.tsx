/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  getDefaultNormalizer,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  canonicalizePetrinautIds,
  createJsonDocHandle,
  type PetrinautExperimentHost,
  type PetrinautExperimentRequest,
  type PetrinautExperimentResult,
  createPetrinaut,
  getLatestNetDefinitionToolName,
  type Petrinaut,
  setNetTitleToolName,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createTestPluginApi } from "../testing/create-test-plugin-api";
import { TestAssistantPanel } from "../testing/test-assistant-panel";
import { AssistantChat, type AssistantChatProps } from "./assistant-chat";

import type { PetrinautAiMessage, PetrinautAiTransport } from "./ai-message";
import type { AssistantChatStart } from "./assistant-chat-start";
import type {
  AddNotificationInput,
  EditRefusal,
} from "@hashintel/petrinaut/ui/plugin";
import type { UIMessageChunk } from "ai";

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
};

const nonEmptySDCPN: SDCPN = {
  ...emptySDCPN,
  places: [
    {
      id: "place-1",
      name: "PlaceOne",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
};

const streamChunks = (
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const textChunks = (id: string, text: string): UIMessageChunk[] => [
  { type: "start-step" },
  { type: "text-start", id },
  { type: "text-delta", id, delta: text },
  { type: "text-end", id },
];

const testInstances: ReturnType<typeof createPetrinaut>[] = [];

vi.mock("@hashintel/petrinaut/ui/plugin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hashintel/petrinaut/ui/plugin")>()),
  ...(await import("../testing/test-assistant-panel")).assistantPanelMocks,
}));

/** What a test passes the chat; the panel supplies `api` and `start`. */
type TestAssistant = Omit<
  AssistantChatProps,
  "api" | "start" | "onStartHandled"
>;

/**
 * The chat under test in the assistant panel, with a start built from the
 * initial message.
 */
const TestChat = ({
  initialMessage,
  ...props
}: Omit<AssistantChatProps, "start" | "onStartHandled"> & {
  initialMessage?: string;
}) => {
  const [start, setStart] = useState<AssistantChatStart | null>(
    initialMessage === undefined ? null : { text: initialMessage },
  );

  return (
    <TestAssistantPanel>
      <AssistantChat
        {...props}
        start={start}
        onStartHandled={() => setStart(null)}
      />
    </TestAssistantPanel>
  );
};

/** What the chat notified, in order; cleared after each test. */
const notifications: AddNotificationInput[] = [];
const recordNotification = (notification: AddNotificationInput) => {
  notifications.push(notification);

  return String(notifications.length);
};
const matchesNotification =
  (text: string | RegExp) =>
  ({ message, detail }: AddNotificationInput) =>
    [message, detail].some(
      (value) =>
        value !== undefined &&
        (typeof text === "string" ? value === text : text.test(value)),
    );
/** Waits until the chat notifies a message or detail matching `text`. */
const findNotification = (text: string | RegExp) =>
  waitFor(() => {
    const found = notifications.find(matchesNotification(text));
    expect(found).toBeDefined();

    return found;
  });

/** The chat's `api` over `instance`, recording notifications. */
const chatApiFor = (
  instance: Petrinaut,
  options: Parameters<typeof createTestPluginApi>[1] = {},
) =>
  createTestPluginApi(instance, {
    title: "AI assistant panel test",
    notify: recordNotification,
    ...options,
  });

const renderTestPanel = ({
  aiAssistant,
  errorTracker,
  initialMessage,
  petriNetDefinition = emptySDCPN,
  strictMode = false,
  experimentHost,
  refusal = null,
}: {
  aiAssistant: TestAssistant;
  errorTracker?: {
    captureException: (error: unknown, context?: object) => void;
  };
  initialMessage?: string;
  petriNetDefinition?: SDCPN;
  strictMode?: boolean;
  experimentHost?: PetrinautExperimentHost;
  /** Why the editor refuses every edit, as a read-only editor does. */
  refusal?: EditRefusal | null;
}) => {
  const handle = createJsonDocHandle({
    id: "ai-assistant-panel-test",
    initial: petriNetDefinition,
  });
  const instance = createPetrinaut({ document: handle });
  testInstances.push(instance);
  const api = chatApiFor(instance, {
    refusal: () => refusal,
    ...(experimentHost && { runExperiment: experimentHost.runExperiment }),
    ...(errorTracker && { capture: errorTracker.captureException }),
  });
  const renderPanel = (nextAiAssistant: TestAssistant) => (
    <TestChat api={api} initialMessage={initialMessage} {...nextAiAssistant} />
  );
  const rendered = render(renderPanel(aiAssistant), {
    wrapper: ({ children }) =>
      strictMode ? <StrictMode>{children}</StrictMode> : children,
  });

  return {
    ...rendered,
    instance,
    rerenderPanel: (nextAiAssistant: TestAssistant) =>
      rendered.rerender(renderPanel(nextAiAssistant)),
  };
};

afterEach(() => {
  cleanup();
  notifications.length = 0;
  for (const instance of testInstances.splice(0)) {
    instance.dispose();
  }
});

describe("AssistantChat composer submissions", () => {
  test("declines setNetTitle when the editor cannot set the title", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks(
            requestMessages.length === 1
              ? [
                  { type: "start-step" },
                  {
                    type: "tool-input-available",
                    toolCallId: "set-title-1",
                    toolName: setNetTitleToolName,
                    input: { title: "Renamed" },
                  },
                ]
              : [...textChunks("done", "Title was not changed.")],
          ),
        );
      }),
    };

    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Rename the net",
    });

    await waitFor(() =>
      expect(transport.sendMessages).toHaveBeenCalledTimes(2),
    );
    expect(
      requestMessages[1]?.flatMap((message) => message.parts),
    ).toContainEqual(
      expect.objectContaining({
        toolCallId: "set-title-1",
        output: {
          applied: false,
          blocked: "no-title-setter",
          reason: "The host application does not provide title editing.",
        },
      }),
    );
  });
  test("reports a refused submission to the error tracker at its source", async () => {
    const captureException =
      vi.fn<(error: unknown, context?: object) => void>();
    const failure = new Error("Brunch rejected the message before admission.");
    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: async () => null,
          sendMessages: async () => {
            throw failure;
          },
        },
      },
      errorTracker: { captureException },
    });
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await findNotification("Brunch rejected the message before admission."),
    ).not.toBeNull();
    await waitFor(() => expect(captureException).toHaveBeenCalledOnce());
    expect(captureException).toHaveBeenCalledWith(failure, {
      source: "ai-assistant.stream",
    });
  });

  test("does not offer a message again once the transport has accepted it", async () => {
    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: async () => null,
          sendMessages: async () =>
            new ReadableStream<UIMessageChunk>({
              start(controller) {
                controller.error(new Error("The stream was lost."));
              },
            }),
        },
      },
    });
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Send this once" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await findNotification("The stream was lost.")).not.toBeNull();
    expect(textarea.value).toBe("");
  });

  test("applies a canonical mutation once before matching output insertion and continuation in StrictMode", async () => {
    let boundInstance: ReturnType<typeof createPetrinaut> | undefined;
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(
      async ({ messages }) => {
        expect(boundInstance?.definition.get().places[0]?.name).toBe(
          "ObservedPlace",
        );
        expect(messages.flatMap((message) => message.parts)).toContainEqual(
          expect.objectContaining({
            toolCallId: "a3-panel-call",
            state: "output-available",
            output: expect.objectContaining({ applied: true }) as unknown,
          }),
        );
        return streamChunks([
          ...textChunks("a3-reply", "Continued after observation."),
          { type: "finish", finishReason: "stop" },
        ]);
      },
    );
    const { instance } = renderTestPanel({
      strictMode: true,
      petriNetDefinition: nonEmptySDCPN,
      aiAssistant: {
        messages: [
          {
            id: "a3-panel-message",
            role: "assistant",
            parts: [
              {
                type: "tool-updatePlace",
                toolCallId: "a3-panel-call",
                state: "input-available",
                input: {
                  placeId: "place-1",
                  update: { name: "ObservedPlace" },
                },
              },
            ],
          },
        ],
        transport: { reconnectToStream: async () => null, sendMessages },
      },
    });
    boundInstance = instance;
    // The production diagnostics wrapper can wait one second before sending.
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce(), {
      timeout: 5_000,
    });
    expect(
      await screen.findByText("Continued after observation."),
    ).not.toBeNull();
  });

  test("executes locally streamed static tools and continues exactly once", async () => {
    const sendMessages = vi
      .fn<PetrinautAiTransport["sendMessages"]>()
      .mockResolvedValueOnce(
        streamChunks([
          { type: "start", messageId: "local-tool-message" },
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolName: "updatePlace",
            toolCallId: "local-mutation",
            input: { placeId: "place-1", update: { name: "LocallyApplied" } },
          },
          { type: "finish-step" },
          { type: "finish", finishReason: "tool-calls" },
        ]),
      )
      .mockResolvedValueOnce(
        streamChunks([
          ...textChunks("continued", "Local mutation continued"),
          { type: "finish", finishReason: "stop" },
        ]),
      );
    const mounted = renderTestPanel({
      aiAssistant: {
        transport: { reconnectToStream: async () => null, sendMessages },
      },
      petriNetDefinition: nonEmptySDCPN,
      initialMessage: "Change the name",
    });
    await screen.findByText("Local mutation continued", {}, { timeout: 5_000 });
    expect(sendMessages).toHaveBeenCalledTimes(2);
    expect(mounted.instance.definition.get().places[0]?.name).toBe(
      "LocallyApplied",
    );
  });

  test("replays StrictMode effects without stranding an initially recovered tool", async () => {
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(async () =>
      streamChunks([
        ...textChunks("reply", "Done."),
        { type: "finish", finishReason: "stop" },
      ]),
    );
    renderTestPanel({
      strictMode: true,
      aiAssistant: {
        messages: [
          {
            id: "strict-call",
            role: "assistant",
            parts: [
              {
                type: "tool-readPetrinautDoc",
                toolCallId: "strict-read",
                state: "input-available",
                input: { doc: "ai-assistant" },
              },
            ],
          },
        ],
        transport: { reconnectToStream: async () => null, sendMessages },
      },
    });
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());
  });

  test("executes a pending built-in from hydrated history once", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(
      ({ messages }) => {
        requestMessages.push(structuredClone(messages));
        return Promise.resolve(
          streamChunks([
            { type: "start-step" },
            { type: "text-start", id: "resumed" },
            {
              type: "text-delta",
              id: "resumed",
              delta: "Live net received.",
            },
            { type: "text-end", id: "resumed" },
          ]),
        );
      },
    );
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages,
    };
    const pendingMessages: PetrinautAiMessage[] = [
      {
        id: "assistant-pending-net-read",
        role: "assistant",
        parts: [
          {
            type: "tool-getLatestNetDefinition",
            state: "input-available",
            toolCallId: "pending-net-read",
            input: {},
          },
        ],
      },
    ];
    const { rerenderPanel } = renderTestPanel({
      aiAssistant: { messages: pendingMessages, transport },
      petriNetDefinition: nonEmptySDCPN,
    });

    expect(await screen.findByText("Live net received.")).not.toBeNull();
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());
    const submittedTool = requestMessages[0]?.[0]?.parts[0];
    expect(submittedTool).toMatchObject({
      type: "tool-getLatestNetDefinition",
      state: "output-available",
      toolCallId: "pending-net-read",
      output: {
        title: "AI assistant panel test",
        definition: canonicalizePetrinautIds(nonEmptySDCPN),
        extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      },
    });

    rerenderPanel({ messages: pendingMessages, transport });
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  test("continues through consecutive automatic client tools", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(
      ({ messages }) => {
        requestMessages.push(structuredClone(messages));
        if (requestMessages.length <= 2) {
          const toolCallId = `automatic-net-read-${requestMessages.length}`;
          return Promise.resolve(
            streamChunks([
              { type: "start-step" },
              {
                type: "tool-input-available",
                toolCallId,
                toolName: getLatestNetDefinitionToolName,
                input: {},
              },
              { type: "finish-step" },
              { type: "finish", finishReason: "tool-calls" },
            ]),
          );
        }
        return Promise.resolve(
          streamChunks(
            textChunks("automatic-complete", "Construction complete"),
          ),
        );
      },
    );

    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
      initialMessage: "Construct the net",
      petriNetDefinition: nonEmptySDCPN,
    });

    await waitFor(() => expect(sendMessages).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("Construction complete")).not.toBeNull();
    expect(
      requestMessages[1]?.flatMap((message) => message.parts),
    ).toContainEqual(
      expect.objectContaining({
        state: "output-available",
        toolCallId: "automatic-net-read-1",
      }),
    );
    expect(
      requestMessages[2]?.flatMap((message) => message.parts),
    ).toContainEqual(
      expect.objectContaining({
        state: "output-available",
        toolCallId: "automatic-net-read-2",
      }),
    );
  });

  test("submits multiple automatic tool outputs in one continuation", async () => {
    const requestMessages: PetrinautAiMessage[][] = [];
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(
      ({ messages }) => {
        requestMessages.push(structuredClone(messages));
        if (requestMessages.length === 1) {
          return Promise.resolve(
            streamChunks([
              { type: "start-step" },
              {
                type: "tool-input-available",
                toolCallId: "batched-net-read-1",
                toolName: getLatestNetDefinitionToolName,
                input: {},
              },
              {
                type: "tool-input-available",
                toolCallId: "batched-net-read-2",
                toolName: getLatestNetDefinitionToolName,
                input: {},
              },
              { type: "finish-step" },
              { type: "finish", finishReason: "tool-calls" },
            ]),
          );
        }
        return Promise.resolve(
          streamChunks(textChunks("batch-complete", "Both reads received")),
        );
      },
    );

    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
      initialMessage: "Read the net twice",
      petriNetDefinition: nonEmptySDCPN,
    });

    await waitFor(() => expect(sendMessages).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Both reads received")).not.toBeNull();
    const continuationParts = requestMessages[1]?.flatMap(
      (message) => message.parts,
    );
    expect(continuationParts).toContainEqual(
      expect.objectContaining({
        state: "output-available",
        toolCallId: "batched-net-read-1",
      }),
    );
    expect(continuationParts).toContainEqual(
      expect.objectContaining({
        state: "output-available",
        toolCallId: "batched-net-read-2",
      }),
    );
  });

  test("does not continue while a sibling automatic tool is pending", async () => {
    let releaseLayout: (() => void) | undefined;
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(() =>
      Promise.resolve(
        streamChunks([
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolCallId: "staggered-net-read",
            toolName: getLatestNetDefinitionToolName,
            input: {},
          },
          {
            type: "tool-input-available",
            toolCallId: "staggered-layout",
            toolName: "applyAutoLayout",
            input: { askUserFirst: false },
          },
          { type: "finish-step" },
          { type: "finish", finishReason: "tool-calls" },
        ]),
      ),
    );

    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
      initialMessage: "Read and lay out the net",
      petriNetDefinition: nonEmptySDCPN,
    });
    const instance = testInstances.at(-1);
    if (instance === undefined) {
      throw new Error("Expected the panel to create a Petrinaut instance.");
    }
    const layout = vi
      .spyOn(instance.commands, "applyAutoLayout")
      .mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          releaseLayout = resolve;
        });
        return { commitCount: 0 };
      });

    await waitFor(() => expect(releaseLayout).toBeDefined());
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        }),
    );
    expect(sendMessages).toHaveBeenCalledOnce();

    await act(async () => {
      releaseLayout?.();
      await layout.mock.results[0]?.value;
    });
  });

  test("restores a typed draft when its message submission rejects", async () => {
    let rejectSubmission: ((reason: Error) => void) | undefined;
    const sendMessages = vi.fn(
      () =>
        new Promise<ReadableStream<UIMessageChunk>>((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );

    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Recover this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());

    await act(async () => {
      rejectSubmission?.(new Error("Message submission rejected."));
    });

    expect(
      await findNotification("Message submission rejected."),
    ).not.toBeNull();
    expect(textarea.value).toBe("Recover this draft");
  });

  test("does not replace newer composer input when a submission rejects", async () => {
    let rejectSubmission: ((reason: Error) => void) | undefined;
    const sendMessages = vi.fn(
      () =>
        new Promise<ReadableStream<UIMessageChunk>>((_resolve, reject) => {
          rejectSubmission = reject;
        }),
    );

    renderTestPanel({
      aiAssistant: {
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages,
        },
      },
    });

    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Message AI assistant",
    });
    fireEvent.change(textarea, { target: { value: "Original draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(sendMessages).toHaveBeenCalledOnce());
    fireEvent.change(textarea, { target: { value: "Unrelated newer input" } });

    await act(async () => {
      rejectSubmission?.(new Error("Late submission rejection."));
    });

    expect(textarea.value).toBe("Unrelated newer input");
  });

  test("treats a Stop that aborts a follow-up before it streams as no error", async () => {
    const captureException =
      vi.fn<(error: unknown, context?: object) => void>();
    const followUpAborted = vi.fn();
    const sendMessages = vi
      .fn<PetrinautAiTransport["sendMessages"]>()
      .mockResolvedValueOnce(
        streamChunks([
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolCallId: "net-read",
            toolName: getLatestNetDefinitionToolName,
            input: {},
          },
          { type: "finish-step" },
          { type: "finish", finishReason: "tool-calls" },
        ]),
      )
      // The follow-up is still being prepared, as while diagnostics run, and
      // fails as fetch does once Stop aborts it.
      .mockImplementationOnce(
        ({ abortSignal }) =>
          new Promise((_resolve, reject) => {
            abortSignal?.addEventListener("abort", () => {
              followUpAborted();
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      );
    renderTestPanel({
      aiAssistant: {
        transport: { reconnectToStream: async () => null, sendMessages },
      },
      errorTracker: { captureException },
      initialMessage: "Read the net",
      petriNetDefinition: nonEmptySDCPN,
    });
    await waitFor(() => expect(sendMessages).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));

    await waitFor(() => expect(followUpAborted).toHaveBeenCalledOnce());
    expect(await screen.findByText("Response stopped")).not.toBeNull();
    expect(captureException).not.toHaveBeenCalled();
    expect(notifications).toEqual([]);
  });

  test("cancels the local stream on Stop", async () => {
    const localCancellation = vi.fn();
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(
        ({
          abortSignal,
        }: Parameters<PetrinautAiTransport["sendMessages"]>[0]) =>
          Promise.resolve(
            new ReadableStream<UIMessageChunk>({
              start(controller) {
                controller.enqueue({ type: "start-step" });
                controller.enqueue({ type: "text-start", id: "partial" });
                controller.enqueue({
                  type: "text-delta",
                  id: "partial",
                  delta: "Partial response",
                });
                abortSignal?.addEventListener("abort", () => {
                  localCancellation();
                  controller.error(new DOMException("Aborted", "AbortError"));
                });
              },
            }),
          ),
      ),
    };

    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Start a long response",
    });
    await screen.findByText("Partial response");

    fireEvent.click(screen.getByRole("button", { name: "Stop AI response" }));

    await waitFor(() => expect(localCancellation).toHaveBeenCalledOnce());
    expect(await screen.findByText("Response stopped")).not.toBeNull();
  });

  test("reports a failed tool call to the error tracker and in its tool row", async () => {
    const captureException =
      vi.fn<(error: unknown, context?: object) => void>();
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(async () =>
      streamChunks([
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "invalid-doc",
          toolName: "readPetrinautDoc",
          input: { doc: "not-a-guide-page" },
        },
        { type: "finish-step" },
        { type: "finish", finishReason: "tool-calls" },
      ]),
    );
    renderTestPanel({
      aiAssistant: {
        transport: { reconnectToStream: async () => null, sendMessages },
      },
      errorTracker: { captureException },
      initialMessage: "Read the guide",
    });
    await waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
        source: "ai-assistant.automatic-tool",
        tags: { toolName: "readPetrinautDoc", toolCallId: "invalid-doc" },
      }),
    );
    const failure = captureException.mock.calls[0]?.[0] as Error;
    expect(await findNotification(failure.message)).not.toBeNull();
    expect(
      await screen.findByText(failure.message, {
        normalizer: getDefaultNormalizer({
          trim: false,
          collapseWhitespace: false,
        }),
      }),
    ).not.toBeNull();
    expect(sendMessages).toHaveBeenCalledOnce();
  });

  test("stays busy between a tool-calls step and its follow-up", async () => {
    const composerActions: ("stop" | "send")[] = [];
    // The composer's action after each DOM change.
    const observer = new MutationObserver(() => {
      composerActions.push(
        document.querySelector('[aria-label="Stop AI response"]')
          ? "stop"
          : "send",
      );
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    let requestCount = 0;
    const transport: PetrinautAiTransport = {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: vi.fn(() => {
        requestCount += 1;
        return Promise.resolve(
          streamChunks(
            requestCount === 1
              ? [
                  ...textChunks("preamble", "Checking the net"),
                  {
                    type: "tool-input-available",
                    toolCallId: "net-read-1",
                    toolName: "getLatestNetDefinition",
                    input: {},
                  },
                  { type: "finish-step" },
                  { type: "finish", finishReason: "tool-calls" },
                ]
              : [
                  ...textChunks("reply", "The net has one place"),
                  { type: "finish-step" },
                  { type: "finish", finishReason: "stop" },
                ],
          ),
        );
      }),
    };

    try {
      renderTestPanel({
        aiAssistant: { transport },
        initialMessage: "Read the net",
        petriNetDefinition: nonEmptySDCPN,
      });
      await screen.findByText("The net has one place");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Stop AI response" }),
        ).toBeNull(),
      );
    } finally {
      observer.disconnect();
    }

    // The SDK reports `ready` between the tool-calls step and the follow-up it
    // sends automatically; the composer must not read that gap as the turn's end.
    const firstBusy = composerActions.indexOf("stop");
    const lastBusy = composerActions.lastIndexOf("stop");
    expect(firstBusy).toBeGreaterThanOrEqual(0);
    expect(composerActions.slice(firstBusy, lastBusy + 1)).not.toContain(
      "send",
    );
    expect(composerActions.at(-1)).toBe("send");
  });
});

describe("AI experiment requests", () => {
  const request: PetrinautExperimentRequest = {
    name: "Chat experiment",
    scenarioId: "scenario-1",
    scenarioParameterValues: {},
    runCount: 8,
    seed: 42,
    dt: 0.1,
    maxTime: 10,
    metricIds: ["metric-1"],
    execution: { mode: "simulate" },
  };
  const result: PetrinautExperimentResult = {
    status: "complete",
    experimentId: "experiment-1",
    name: request.name,
    runsCompleted: 8,
    metrics: [{ id: "metric-1", label: "Count", value: 12 }],
  };
  const createTransport = () => {
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>();
    sendMessages.mockImplementationOnce(async () =>
      streamChunks([
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "experiment-call",
          toolName: "createExperiment",
          input: request,
        },
        { type: "finish-step" },
        { type: "finish", finishReason: "tool-calls" },
      ]),
    );
    sendMessages.mockImplementation(async () =>
      streamChunks(textChunks("done", "Result received")),
    );
    return {
      transport: { reconnectToStream: async () => null, sendMessages },
      sendMessages,
    };
  };

  test("shows progress and sends exactly one captured result after completion", async () => {
    const completion = Promise.withResolvers<PetrinautExperimentResult>();
    const createExperiment = vi.fn<PetrinautExperimentHost["runExperiment"]>(
      (input, options) => {
        options?.onProgress?.({
          experimentId: "experiment-1",
          name: input.name,
          phase: "running",
          runsCompleted: 3,
          runsTarget: 8,
        });
        return completion.promise;
      },
    );
    const { transport, sendMessages } = createTransport();
    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Run an experiment",
      experimentHost: { runExperiment: createExperiment },
    });

    const card = await screen.findByRole("region", {
      name: "Experiment: Chat experiment",
    });
    await waitFor(() =>
      expect(within(card).getByText("3 of 8 runs")).not.toBeNull(),
    );
    expect(sendMessages).toHaveBeenCalledTimes(1);
    await act(async () => completion.resolve(result));
    await screen.findByText("Result received");
    expect(within(card).getByText("Finished")).not.toBeNull();
    expect(within(card).getByText("Count")).not.toBeNull();
    expect(within(card).getByText("12")).not.toBeNull();
    expect(sendMessages).toHaveBeenCalledTimes(2);
    expect(
      sendMessages.mock.calls[1]?.[0].messages.flatMap(
        (message) => message.parts,
      ),
    ).toContainEqual(
      expect.objectContaining({
        type: "tool-createExperiment",
        output: result,
      }),
    );
  });

  test("cancels browser computation through the experiment card", async () => {
    const createExperiment = vi.fn<PetrinautExperimentHost["runExperiment"]>(
      (input, options) =>
        new Promise((resolve) => {
          options?.onProgress?.({
            experimentId: "experiment-1",
            name: input.name,
            phase: "running",
            runsCompleted: 0,
            runsTarget: 8,
          });
          options?.signal?.addEventListener("abort", () =>
            resolve({
              ...result,
              status: "cancelled",
              runsCompleted: 0,
              metrics: [],
            }),
          );
        }),
    );
    const { transport } = createTransport();
    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Run an experiment",
      experimentHost: { runExperiment: createExperiment },
    });
    const card = await screen.findByRole("region", {
      name: "Experiment: Chat experiment",
    });
    await waitFor(() => expect(createExperiment).toHaveBeenCalledOnce());
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(within(card).getByText("Cancelled")).not.toBeNull(),
    );
    expect(createExperiment.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  test("allows cancellation during validation before the experiment reports progress", async () => {
    const completion = Promise.withResolvers<PetrinautExperimentResult>();
    const runExperiment = vi.fn<PetrinautExperimentHost["runExperiment"]>(
      (_input, options) => {
        options?.signal?.addEventListener("abort", () =>
          completion.resolve({
            ...result,
            status: "cancelled",
            experimentId: null,
            runsCompleted: 0,
            metrics: [],
          }),
        );
        return completion.promise;
      },
    );
    const { transport } = createTransport();
    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Run",
      experimentHost: { runExperiment },
    });
    const card = await screen.findByRole("region", {
      name: "Experiment: Chat experiment",
    });
    await waitFor(() =>
      expect(within(card).getByText("Validating")).not.toBeNull(),
    );
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(within(card).getByText("Cancelled")).not.toBeNull(),
    );
    expect(runExperiment.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  test("clears active experiment indicators if the experiment rejects", async () => {
    const completion = Promise.withResolvers<PetrinautExperimentResult>();
    const runExperiment = vi.fn<PetrinautExperimentHost["runExperiment"]>(
      () => completion.promise,
    );
    const { transport } = createTransport();
    renderTestPanel({
      aiAssistant: { transport },
      initialMessage: "Run",
      experimentHost: { runExperiment },
    });
    const card = await screen.findByRole("region", {
      name: "Experiment: Chat experiment",
    });
    await waitFor(() =>
      expect(within(card).getByText("Validating")).not.toBeNull(),
    );
    await act(async () => completion.reject(new Error("Experiment failed")));
    await waitFor(() => expect(card.getAttribute("aria-busy")).toBe("false"));
    expect(within(card).queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe("AssistantChat and the editor", () => {
  test("reports a refused edit as the blocked output and leaves the net unchanged", async () => {
    const sendMessages = vi.fn<PetrinautAiTransport["sendMessages"]>(
      async ({ messages }) => {
        expect(messages.flatMap((message) => message.parts)).toContainEqual(
          expect.objectContaining({
            toolCallId: "refused-call",
            state: "output-available",
            output: {
              applied: false,
              blocked: "simulate-mode",
              reason: expect.stringContaining("simulate mode") as string,
            },
          }),
        );

        return streamChunks([
          ...textChunks("refused-reply", "Switch to edit mode first."),
          { type: "finish", finishReason: "stop" },
        ]);
      },
    );
    const { instance } = renderTestPanel({
      petriNetDefinition: nonEmptySDCPN,
      refusal: { kind: "simulate-mode" },
      aiAssistant: {
        messages: [
          {
            id: "refused-message",
            role: "assistant",
            parts: [
              {
                type: "tool-updatePlace",
                toolCallId: "refused-call",
                state: "input-available",
                input: { placeId: "place-1", update: { name: "Refused" } },
              },
            ],
          },
        ],
        transport: { reconnectToStream: async () => null, sendMessages },
      },
    });

    await screen.findByText(
      "Switch to edit mode first.",
      {},
      { timeout: 5_000 },
    );
    expect(instance.definition.get().places[0]?.name).toBe("PlaceOne");
  });
});
