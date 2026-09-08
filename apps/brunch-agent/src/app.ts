/** The app's route map — one ownership-guarded Flue conversation door. */

import "./telemetry-bootstrap.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";

import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { instrument, setProvider } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  READ_PETRINAUT_DOC_TOOL_NAME,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import { ChatAgent } from "./agents/chat-agent/agent.ts";
import { healthHandler } from "./health.ts";
import { assetHandler } from "./http/assets.ts";
import { createAgentCors, parseCorsAllowedOrigins } from "./http/cors.ts";
import { agentOwnershipGuard } from "./http/ownership.ts";
import { CHAT_AGENT_ROUTE, HEALTH_ROUTE } from "./http/routes.ts";
import { createStepARequestAccounting } from "./provider-accounting.ts";
import { withBufferedToolAdmission } from "./provider-admission.ts";

// Scope follows the runtime's submission execution, not the HTTP request that
// merely queues it. It is an async execution flag, never a proposal/state ledger.
const admissionScope = new AsyncLocalStorage<boolean>();
instrument({
  key: Symbol.for("brunch.buffered-tool-admission"),
  observe() {},
  interceptor(operation, context, next) {
    if (operation.type === "agent" && context.agentName !== undefined) {
      return admissionScope.run(
        context.agentName === ChatAgent.agentName,
        next,
      );
    }
    if (operation.type === "task") return admissionScope.run(false, next);
    return next();
  },
  dispose() {},
});
const accounting = createStepARequestAccounting(
  process.env.BRUNCH_STEP_A_ACCOUNTING,
);
if (accounting) {
  instrument({
    key: Symbol.for("brunch.step-a-request-accounting"),
    observe() {},
    interceptor: accounting.interceptor,
    dispose() {},
  });
}
const nativeProvider = anthropicProvider();
setProvider(
  withBufferedToolAdmission(
    accounting?.wrap(
      nativeProvider,
      () => admissionScope.getStore() === true,
    ) ?? nativeProvider,
    () => admissionScope.getStore() === true,
    new Set([
      ...PETRINAUT_CONSTRUCTION_TOOL_NAMES,
      READ_PETRINAUT_DOC_TOOL_NAME,
    ]),
  ),
);

const app = new Hono();

const agentMount = "/agents";
const chatAgentMount = `${agentMount}/${CHAT_AGENT_ROUTE}`;
app.use(
  `${agentMount}/*`,
  createAgentCors(
    parseCorsAllowedOrigins(process.env.BRUNCH_CORS_ALLOWED_ORIGINS),
  ),
);
app.use(`${chatAgentMount}/*`, agentOwnershipGuard(`${chatAgentMount}/`));
app.route(chatAgentMount, createAgentRouter(ChatAgent));

app.get(HEALTH_ROUTE, healthHandler);

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
