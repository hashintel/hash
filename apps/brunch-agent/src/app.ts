/** The app's route map — one ownership-guarded Flue conversation door. */

import "./server/telemetry-bootstrap.ts";
import { readFile } from "node:fs/promises";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { instrument, setProvider } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import {
  browserExecutedToolNames,
  brunchEnv,
  brunchRoutes,
  brunchTools,
  netReaderToolNames,
} from "@hashintel/brunch-agent";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";
import {
  createLiveToolBroadcaster,
  createLiveToolObserver,
  liveToolResponse,
  liveToolRouteSegment,
} from "@local/flue-aisdk-transport/server";

import { agents } from "./agents/index.ts";
import { healthHandler } from "./server/health.ts";
import { assetHandler } from "./server/http/assets.ts";
import { createBrowserCallRouter } from "./server/http/browser-calls.ts";
import {
  createAgentCors,
  parseCorsAllowedOrigins,
} from "./server/http/cors.ts";
import { agentOwnershipGuard } from "./server/http/ownership.ts";
import { logger } from "./server/logger.ts";
import { createTurnChronologyObserver } from "./server/observe-turn-chronology.ts";
import { openaiProviderWithAddedModels } from "./server/openai-provider.ts";
import { openrouterProviderWithAddedModels } from "./server/openrouter-provider.ts";
import { createStepARequestAccounting } from "./server/provider-accounting.ts";
import {
  claimModelStreamIdleRetry,
  modelStreamIdleTimeoutDefaults,
  modelAdmissionScope,
  withBufferedToolAdmission,
} from "./server/provider-admission.ts";
import { diagnostics } from "./server/runtime-diagnostics.ts";

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
const mountedAgents = agents.filter(
  ({ devOnly }) => devOnly !== true || process.env.NODE_ENV !== "production",
);
const mountedAgentNames = new Set(
  mountedAgents.map(({ agent }) => agent.agentName),
);
// Each agent gets its own live-tool channel, so two agents never share one
// for the same instance ID.
const liveToolBroadcasters = new Map(
  mountedAgents.map(({ agent }) => {
    const broadcaster = createLiveToolBroadcaster();
    const observer = createLiveToolObserver(broadcaster, agent.agentName);
    instrument({
      key: Symbol.for(`brunch.live-pending-tools:${agent.agentName}`),
      observe: observer.observe,
      interceptor: (_operation, _context, next) => next(),
      dispose() {
        observer.dispose();
        broadcaster.close();
      },
    });
    return [agent.agentName, broadcaster] as const;
  }),
);
// One line per settled submission: every model request with its time to
// first event and each tool call's argument-streaming profile, so a provider
// stall reads differently from slow generation. Ids and durations only.
for (const { agent } of mountedAgents) {
  const turnChronologyObserver = createTurnChronologyObserver(
    agent.agentName,
    (chronology) =>
      logger.info("[brunch] flue.submission chronology", chronology),
  );
  instrument({
    key: Symbol.for(`brunch.turn-chronology:${agent.agentName}`),
    observe: turnChronologyObserver.observe,
    interceptor: (_operation, _context, next) => next(),
    dispose: turnChronologyObserver.dispose,
  });
}
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
        mountedAgentNames.has(context.agentName)
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
// The Pi AI patch preserves complete Anthropic schemas independently of strict
// generation. Retained contracts and removal proofs: docs/dependency-patches.md.
const browserToolNames = browserExecutedToolNames;
const mixedToolNames = new Set([
  ...browserExecutedToolNames,
  brunchTools.ping,
  brunchTools.ledgerCommit,
  brunchTools.ledgerCompile,
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.queryBasis,
]);
// Running these beside their dependency would answer from the previous result.
const dependentToolNames = new Map([
  [
    brunchTools.queryBasis,
    [getLatestNetDefinitionToolName, ...Object.values(netReaderToolNames)],
  ],
  [brunchTools.ledgerCompile, [brunchTools.ledgerCommit]],
  [brunchTools.draftPetrinautExperiment, [getLatestNetDefinitionToolName]],
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
        mixedToolNames,
        dependentToolNames,
        claimRetry: () => claimModelStreamIdleRetry(admissionScope.getStore()),
        firstEventTimeoutMs: modelStreamFirstEventTimeoutMs,
        idleTimeoutMs: modelStreamIdleTimeoutMs,
        reasoningStartTimeoutMs: modelStreamReasoningStartTimeoutMs,
      },
    ),
  );
};
registerAdmittedProvider(anthropicProvider());
registerAdmittedProvider(openaiProviderWithAddedModels());
registerAdmittedProvider(openrouterProviderWithAddedModels());

const app = new Hono();

app.use(
  `${brunchRoutes.agents}/*`,
  createAgentCors(
    parseCorsAllowedOrigins(process.env[brunchEnv.corsAllowedOrigins]),
  ),
);
for (const { route, aliases = [], agent } of mountedAgents) {
  const broadcaster = liveToolBroadcasters.get(agent.agentName);
  if (broadcaster === undefined)
    throw new Error(`No live-tool channel for ${agent.agentName}.`);
  for (const segment of [route, ...aliases]) {
    const mount = `${brunchRoutes.agents}/${segment}`;
    app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, agent.agentName));
    app.get(`${mount}/:id/${liveToolRouteSegment}`, (context) =>
      liveToolResponse(broadcaster, {
        instanceId: context.req.param("id"),
        request: context.req.raw,
      }),
    );
    app.route(mount, createBrowserCallRouter());
    app.route(mount, createAgentRouter(agent));
  }
}

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
