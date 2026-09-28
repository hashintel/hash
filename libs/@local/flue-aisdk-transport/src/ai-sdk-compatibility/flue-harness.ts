import { fauxProvider, type FauxResponseStep } from "@earendil-works/pi-ai";
import {
  defineTool,
  instrument,
  useDataWriter,
  useModel,
  useResponseStart,
  useTool,
} from "@flue/runtime";
import { start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient, type FlueClient } from "@flue/sdk";
import * as v from "valibot";

import {
  createLiveToolBroadcaster,
  createLiveToolObserver,
  liveToolResponse,
} from "../server";

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
export const unwrapHarnessEnvelope = (output: unknown): unknown =>
  typeof output === "object" &&
  output !== null &&
  "hostEnvelope" in output &&
  "output" in output
    ? output.output
    : output;

const agentName = "harness-agent";

/**
 * One in-process Flue runtime with a scripted model, served through Flue's
 * own HTTP router and this package's live tool channel. One per test file.
 */
export const startFlueHarness = async () => {
  const faux = fauxProvider({ provider: "faux" });
  const model = faux.getModel();
  let responseMetadata: Record<string, unknown> | undefined;

  function HarnessAgent() {
    useModel(`${model.provider}/${model.id}`);
    useResponseStart(() => responseMetadata);
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
    return route === "live" && instanceId !== undefined
      ? liveToolResponse(broadcaster, { instanceId, request })
      : router.fetch(request);
  };

  return {
    /** A client for a fresh conversation. */
    client: (): FlueClient =>
      createFlueClient({
        url: `http://flue.test/${crypto.randomUUID()}`,
        fetch: fetchHarness,
      }),
    fetch: fetchHarness,
    /** Script the model's next responses, one per model call. */
    script: (responses: FauxResponseStep[]) => faux.setResponses(responses),
    /** Metadata the agent attaches when its next responses start. */
    setResponseMetadata: (metadata: Record<string, unknown> | undefined) => {
      responseMetadata = metadata;
    },
    stop: async () => {
      await flue.stop();
      await uninstrument();
      broadcaster.close();
    },
  };
};
