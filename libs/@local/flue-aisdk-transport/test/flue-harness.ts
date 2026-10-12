import { fauxProvider, type FauxResponseStep } from "@earendil-works/pi-ai";
import {
  defineTool,
  instrument,
  useDataWriter,
  useModel,
  useResponseFinish,
  useResponseStart,
  useTool,
} from "@flue/runtime";
import { start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient, type FlueClient } from "@flue/sdk";
import * as v from "valibot";
import { expect } from "vitest";

import {
  createFlueAiSdkAdapter,
  type FlueAiSdkAdapterConfig,
  type FlueChatTransportOptions,
  type MetadataProjection,
} from "../src/client";
import {
  createLiveToolBroadcaster,
  createLiveToolObserver,
  liveToolResponse,
  liveToolRouteSegment,
} from "../src/server";
import { reduceUiMessageChunks } from "./ai-sdk-oracle";

import type { UIMessage, UIMessageChunk } from "ai";

/** Tools of the in-process harness agent, named by the scenario they drive. */
export const harnessTools = {
  /** A server tool the UI renders as provider-executed. */
  lookup: "lookup",
  /** A server tool whose handler throws. */
  failing: "failing_lookup",
  /** Stands in for a browser tool: its result carries a host envelope. */
  widget: "render_widget",
} as const;

/** The host envelope the widget tool wraps its browser-shaped result in. */
const unwrapHarnessEnvelope = (output: unknown): unknown =>
  typeof output === "object" &&
  output !== null &&
  "hostEnvelope" in output &&
  "output" in output
    ? output.output
    : output;

const agentName = "harness-agent";

/** Agent metadata, plus an `aborted` marker the host derives from Flue. */
const projectHarnessMetadata: MetadataProjection<unknown> = ({
  agentMetadata,
  outcome,
}) => {
  const metadata: Record<string, unknown> = { ...agentMetadata };
  if (outcome === "aborted") metadata.aborted = true;
  return Object.keys(metadata).length === 0 ? undefined : metadata;
};

/** The adapter configuration of a host that renders the widget tool. */
export const harnessAdapterConfig = {
  clientToolNames: new Set<string>([harnessTools.widget]),
  mapToolOutput: unwrapHarnessEnvelope,
  projectMetadata: projectHarnessMetadata,
} satisfies FlueAiSdkAdapterConfig<UIMessage>;

const readAll = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

/**
 * One in-process Flue runtime with a scripted model, served through Flue's
 * own HTTP router and this package's live tool channel. One per test file.
 */
export const startFlueHarness = async () => {
  const faux = fauxProvider({ provider: "faux" });
  const model = faux.getModel();
  let responseMetadata: Record<string, unknown> | undefined;
  let responseFinishMetadata: Record<string, unknown> | undefined;

  function HarnessAgent() {
    useModel(`${model.provider}/${model.id}`);
    useResponseStart(() => responseMetadata);
    useResponseFinish(() => responseFinishMetadata);
    const writeProgress = useDataWriter("progress");
    useTool(
      defineTool({
        name: harnessTools.lookup,
        description: "Look up one fact.",
        input: v.object({ q: v.string() }),
        run: ({ data }) => {
          writeProgress({ q: data.q });
          return { output: { answer: `found ${data.q}` } };
        },
      }),
    );
    useTool(
      defineTool({
        name: harnessTools.failing,
        description: "Always fails.",
        input: v.object({ q: v.string() }),
        run: () => {
          throw new Error("The lookup service is unavailable.");
        },
      }),
    );
    useTool(
      defineTool({
        name: harnessTools.widget,
        description: "Render a widget in the client.",
        input: v.object({ title: v.string() }),
        run: ({ data }) => ({
          output: { hostEnvelope: true, output: { shown: data.title } },
        }),
      }),
    );
    return "Harness agent.";
  }
  HarnessAgent.agentName = agentName;

  const broadcaster = createLiveToolBroadcaster();
  const observer = createLiveToolObserver(broadcaster, agentName);
  const uninstrument = instrument({
    key: Symbol.for("flue-aisdk-transport.harness.live-tools"),
    observe: observer.observe,
    interceptor: (_operation, _context, next) => next(),
    dispose: () => observer.dispose(),
  });
  const flue = await start({
    agents: [HarnessAgent],
    providers: [faux.provider],
  });
  const router = createAgentRouter(HarnessAgent);

  const fetchHarness: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const [instanceId, route] = new URL(request.url).pathname
      .split("/")
      .filter((segment) => segment.length > 0);
    return route === liveToolRouteSegment && instanceId !== undefined
      ? liveToolResponse(broadcaster, { instanceId, request })
      : router.fetch(request);
  };

  const client = (): FlueClient =>
    createFlueClient({
      url: `http://flue.test/${crypto.randomUUID()}`,
      fetch: fetchHarness,
    });

  /**
   * A client whose update stream can be cut mid-turn: open response bodies
   * error, and the next `refusals` update-stream requests get `status`.
   */
  const cuttableClient = () => {
    const openBodies = new Set<ReadableStreamDefaultController<Uint8Array>>();
    let pending = { status: 0, refusals: 0 };
    let refused = 0;
    const cut = (status: number, refusals: number) => {
      pending = { status, refusals };
      for (const body of openBodies) body.error(new TypeError("terminated"));
      openBodies.clear();
    };
    const conversation = createFlueClient({
      url: `http://flue.test/${crypto.randomUUID()}`,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).searchParams.get("view") !== "updates") {
          return fetchHarness(request);
        }
        if (pending.refusals > 0) {
          pending.refusals -= 1;
          refused += 1;
          return new Response("Refused by the harness.", {
            status: pending.status,
          });
        }
        const response = await fetchHarness(request);
        if (response.body === null) return response;
        const reader = response.body.getReader();
        let tracked: ReadableStreamDefaultController<Uint8Array> | undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            tracked = controller;
            openBodies.add(controller);
          },
          async pull(controller) {
            const result = await reader.read();
            if (tracked === undefined || !openBodies.has(tracked)) return;
            if (result.done) {
              openBodies.delete(tracked);
              controller.close();
            } else {
              controller.enqueue(result.value);
            }
          },
          cancel(reason) {
            if (tracked !== undefined) openBodies.delete(tracked);
            return reader.cancel(reason);
          },
        });
        return new Response(body, {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      },
    });
    return { client: conversation, cut, refused: () => refused };
  };

  /**
   * Send one real user turn through the transport, reduce its chunks with the
   * AI SDK, then reopen the same conversation from stored history.
   */
  const runTurn = async (
    text: string,
    options: {
      readonly adapter?: Partial<FlueAiSdkAdapterConfig<UIMessage>>;
      readonly transport?: Partial<FlueChatTransportOptions>;
      /** Runs once the turn is admitted, before its stream is read. */
      readonly duringTurn?: (conversation: FlueClient) => Promise<void>;
      /** The conversation to use; a fresh one by default. */
      readonly client?: FlueClient;
    } = {},
  ) => {
    const conversation = options.client ?? client();
    const adapter = createFlueAiSdkAdapter({
      ...harnessAdapterConfig,
      ...options.adapter,
    });
    const transport = adapter.chatTransport({
      client: conversation,
      ...options.transport,
    });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "conversation",
      messageId: undefined,
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text }] },
      ],
      abortSignal: undefined,
    });
    await options.duringTurn?.(conversation);
    const chunks = await readAll(stream);
    const history = await conversation.history();
    return {
      chunks,
      history,
      live: await reduceUiMessageChunks(chunks),
      reopened: adapter.reopen(history),
    };
  };

  return {
    /** A client for a fresh conversation. */
    client,
    cuttableClient,
    fetch: fetchHarness,
    runTurn,
    /** Script the model's next responses, one per model call. */
    script: (responses: FauxResponseStep[]) => faux.setResponses(responses),
    /** Metadata the agent attaches when its next responses start. */
    setResponseMetadata: (metadata: Record<string, unknown> | undefined) => {
      responseMetadata = metadata;
    },
    /** Metadata the agent merges onto its next responses as they finish. */
    setResponseFinishMetadata: (
      metadata: Record<string, unknown> | undefined,
    ) => {
      responseFinishMetadata = metadata;
    },
    stop: async () => {
      await flue.stop();
      await uninstrument();
      broadcaster.close();
    },
  };
};

type HarnessTurn = Awaited<
  ReturnType<Awaited<ReturnType<typeof startFlueHarness>>["runTurn"]>
>;

/**
 * Drops the accepted live-only details: Flue history keeps no step boundary,
 * and the optional reasoning part id is the live stream's own part id.
 */
export const withoutLiveOnlyDetails = (message: UIMessage | undefined) => {
  if (message === undefined) return undefined;
  const comparable = structuredClone(message);
  comparable.parts = comparable.parts.filter(
    (part) => part.type !== "step-start",
  );
  for (const part of comparable.parts) {
    if (part.type === "reasoning") delete part.id;
  }
  return comparable;
};

/** The reduced live response equals the message its history reopens as. */
export const expectLiveReopenParity = (turn: HarnessTurn) => {
  const reopened = turn.reopened.at(-1);
  expect(reopened?.role).toBe("assistant");
  expect(withoutLiveOnlyDetails(turn.live.message)).toEqual(reopened);
};
