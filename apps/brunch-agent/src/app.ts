/** The app's route map — one ownership-guarded Flue conversation door. */

import { readFile } from "node:fs/promises";

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { ChatAgent } from "./agents/chat-agent/agent.ts";
import { assetHandler } from "./http/assets.ts";
import { agentOwnershipGuard } from "./http/ownership.ts";
import { CHAT_AGENT_ROUTE } from "./http/routes.ts";

instrument(createOpenTelemetryInstrumentation({ content: false }));

const app = new Hono();

const chatAgentMount = `/agents/${CHAT_AGENT_ROUTE}`;
app.use(`${chatAgentMount}/*`, agentOwnershipGuard(`${chatAgentMount}/`));
app.route(chatAgentMount, createAgentRouter(ChatAgent));

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
