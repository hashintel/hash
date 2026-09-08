/** The app's route map — one ownership-guarded Flue conversation door. */

import "./telemetry-bootstrap.ts";
import { readFile } from "node:fs/promises";

import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { ChatAgent } from "./agents/chat-agent/agent.ts";
import { healthHandler } from "./health.ts";
import { assetHandler } from "./http/assets.ts";
import { agentOwnershipGuard } from "./http/ownership.ts";
import { CHAT_AGENT_ROUTE, HEALTH_ROUTE } from "./http/routes.ts";

const app = new Hono();

const chatAgentMount = `/agents/${CHAT_AGENT_ROUTE}`;
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
