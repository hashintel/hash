/** The app's route map — one ownership-guarded Flue conversation door. */

import "./telemetry-bootstrap.ts";
import { readFile } from "node:fs/promises";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { instrument, setProvider } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { brunchEnv, brunchRoutes, brunchTools } from "@hashintel/brunch-agent";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";

import { ChatAgent } from "./agents/chat-agent/agent.ts";
import { createLiveToolBroadcaster } from "./agents/chat-agent/live/live-tool-broadcaster.ts";
import { createLiveToolRoute } from "./agents/chat-agent/live/live-tool-route.ts";
import { createLiveToolObserver } from "./agents/chat-agent/live/observe-live-tools.ts";
import { createTurnChronologyObserver } from "./agents/chat-agent/live/observe-turn-chronology.ts";
import { inBandBrowserToolNames } from "./agents/chat-agent/tool-catalogue.ts";
import { healthHandler } from "./health.ts";
import { assetHandler } from "./http/assets.ts";
import { createBrowserCallRouter } from "./http/browser-calls.ts";
import { createAgentCors, parseCorsAllowedOrigins } from "./http/cors.ts";
import { agentOwnershipGuard } from "./http/ownership.ts";
import { logger } from "./logger.ts";
import { openaiProviderWithGpt6 } from "./openai-provider.ts";
import { createStepARequestAccounting } from "./provider-accounting.ts";
import {
  claimModelStreamIdleRetry,
  modelStreamIdleTimeoutDefaults,
  modelAdmissionScope,
  withBufferedToolAdmission,
} from "./provider-admission.ts";
import { diagnostics } from "./runtime-diagnostics.ts";

import type { Provider } from "@earendil-works/pi-ai";

// Failed runtime events (tools, turns, tasks, compaction, operations,
// settlement, recovery) reach the server log with their runtime IDs; the
// OpenTelemetry instrument stays content-free and this one adds no spans.
instrument({
  key: Symbol.for("brunch.runtime-diagnostics"),
  observe: diagnostics.observe,
  interceptor: (_operation, _context, next) => next(),
  dispose() {},
});
const liveToolBroadcaster = createLiveToolBroadcaster();
const liveToolObserver = createLiveToolObserver(
  liveToolBroadcaster,
  ChatAgent.agentName,
);
instrument({
  key: Symbol.for("brunch.live-pending-tools"),
  observe: liveToolObserver.observe,
  interceptor: (_operation, _context, next) => next(),
  dispose() {
    liveToolObserver.dispose();
    liveToolBroadcaster.close();
  },
});
// One line per settled submission: every model request with its time to
// first event and each tool call's argument-streaming profile, so a provider
// stall reads differently from slow generation. Ids and durations only.
const turnChronologyObserver = createTurnChronologyObserver(
  ChatAgent.agentName,
  (chronology) =>
    logger.info("[brunch] flue.submission chronology", chronology),
);
instrument({
  key: Symbol.for("brunch.turn-chronology"),
  observe: turnChronologyObserver.observe,
  interceptor: (_operation, _context, next) => next(),
  dispose: turnChronologyObserver.dispose,
});
// Scope follows the runtime's submission execution, not the HTTP request that
// merely queues it. It is ephemeral attempt policy, never a proposal/state ledger.
const admissionScope = modelAdmissionScope;
const modelStreamTimeout = (environmentName: string, productionMs: number) => {
  if (process.env.NODE_ENV !== "test") return productionMs;
  const configured = process.env[environmentName];
  if (configured === undefined) return productionMs;
  const milliseconds = Number(configured);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error(`${environmentName} must be a positive integer.`);
  }
  return milliseconds;
};
const modelStreamIdleTimeoutMs = modelStreamTimeout(
  brunchEnv.modelStreamIdleTimeoutMs,
  modelStreamIdleTimeoutDefaults.idleTimeoutMs,
);
const modelStreamFirstEventTimeoutMs = modelStreamTimeout(
  brunchEnv.modelStreamFirstEventTimeoutMs,
  modelStreamIdleTimeoutDefaults.firstEventTimeoutMs,
);
const modelStreamReasoningStartTimeoutMs = modelStreamTimeout(
  brunchEnv.modelStreamReasoningStartTimeoutMs,
  modelStreamIdleTimeoutDefaults.reasoningStartTimeoutMs,
);
const modelStreamCancellationTimeoutMs = modelStreamTimeout(
  brunchEnv.modelStreamCancellationTimeoutMs,
  modelStreamIdleTimeoutDefaults.cancellationTimeoutMs,
);
instrument({
  key: Symbol.for("brunch.buffered-tool-admission"),
  observe() {},
  interceptor(operation, context, next) {
    if (operation.type === "agent" && context.agentName !== undefined)
      return admissionScope.run(
        context.agentName === ChatAgent.agentName
          ? { idleRetryAvailable: true }
          : false,
        next,
      );
    if (operation.type === "task") return admissionScope.run(false, next);
    return next();
  },
  dispose() {},
});
const accounting = createStepARequestAccounting(
  process.env[brunchEnv.stepAAccounting],
);
if (accounting) {
  instrument({
    key: Symbol.for("brunch.step-a-request-accounting"),
    observe() {},
    interceptor: accounting.interceptor,
    dispose() {},
  });
}
// Uses the pinned 0.83.0 Anthropic schema-carriage patch: Pi still strips
// tool parameters to `{ type, properties, required }` unless we override
// `convertTools`. See apps/brunch-agent/AGENTS.md.
const browserToolNames = inBandBrowserToolNames;
const integratedMixedToolNames = new Set([
  ...inBandBrowserToolNames,
  brunchTools.ping,
  brunchTools.mutateWorkpiece,
  brunchTools.readWorkpiece,
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.queryWorkpiece,
]);
// Running these beside their dependency would answer from the previous result.
const integratedDependentToolNames = new Map([
  [brunchTools.queryWorkpiece, [getLatestNetDefinitionToolName]],
  [
    brunchTools.draftPetrinautExperiment,
    [getLatestNetDefinitionToolName, brunchTools.mutateWorkpiece],
  ],
]);
const registerAdmittedProvider = (provider: Provider) => {
  setProvider(
    withBufferedToolAdmission(
      accounting?.wrap(
        provider,
        () => typeof admissionScope.getStore() === "object",
      ) ?? provider,
      () => typeof admissionScope.getStore() === "object",
      browserToolNames,
      {
        cancellationTimeoutMs: modelStreamCancellationTimeoutMs,
        mixedToolNames: integratedMixedToolNames,
        dependentToolNames: integratedDependentToolNames,
        claimRetry: () => claimModelStreamIdleRetry(admissionScope.getStore()),
        firstEventTimeoutMs: modelStreamFirstEventTimeoutMs,
        idleTimeoutMs: modelStreamIdleTimeoutMs,
        reasoningStartTimeoutMs: modelStreamReasoningStartTimeoutMs,
      },
    ),
  );
};
registerAdmittedProvider(anthropicProvider());
registerAdmittedProvider(openaiProviderWithGpt6());

const app = new Hono();

const agentMount = "/agents";
const chatAgentMount = `${agentMount}/${brunchRoutes.chatAgent}`;
app.use(
  `${agentMount}/*`,
  createAgentCors(
    parseCorsAllowedOrigins(process.env[brunchEnv.corsAllowedOrigins]),
  ),
);
app.use(
  `${chatAgentMount}/*`,
  agentOwnershipGuard(`${chatAgentMount}/`, ChatAgent.agentName),
);
app.get(`${chatAgentMount}/:id/live`, createLiveToolRoute(liveToolBroadcaster));
app.route(chatAgentMount, createBrowserCallRouter());
app.route(chatAgentMount, createAgentRouter(ChatAgent));

app.get(brunchRoutes.health, healthHandler);

const uiRoot = new URL(
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- import.meta.env is absent when Node executes this module directly.
  import.meta.env?.DEV === false ? "./client/" : "../",
  import.meta.url,
);

app.get("/", async (c) =>
  c.html(await readFile(new URL("index.html", uiRoot), "utf8")),
);

app.get("/assets/*", assetHandler(uiRoot));

export default app;
