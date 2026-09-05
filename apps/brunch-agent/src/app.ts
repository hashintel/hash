/**
 * The app's route map — one plain Flue chat agent plus Petrinaut's /api/chat door.
 *
 * Both doors require principal + conversation id. `/api/chat` takes the principal
 * header and body `id`; `/agents/chat/:id` takes the same principal plus
 * `x-brunch-conversation` and admits the request only when those re-derive the
 * path id. The Flue instance id is derived, not a bearer token.
 */

import "./telemetry-bootstrap.ts";
import { readFile } from "node:fs/promises";

import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { ChatAgent } from "./agents/chat-agent/agent.ts";
import { healthHandler } from "./health.ts";
import { assetHandler } from "./http/assets.ts";
import { agentOwnershipGuard } from "./http/ownership.ts";
import { createPetrinautChatHandler } from "./http/petrinaut-chat.ts";
import {
  CHAT_AGENT_ROUTE,
  HEALTH_ROUTE,
  PETRINAUT_CHAT_ROUTE,
} from "./http/routes.ts";

const app = new Hono();
const appTransport: typeof fetch = async (input, init) =>
  app.fetch(input instanceof Request ? input : new Request(input, init));
const petrinautChatHandler = createPetrinautChatHandler(appTransport);

const chatAgentMount = `/agents/${CHAT_AGENT_ROUTE}`;
app.use(`${chatAgentMount}/*`, agentOwnershipGuard(`${chatAgentMount}/`));
app.route(chatAgentMount, createAgentRouter(ChatAgent));

app.on(["GET", "POST", "OPTIONS"], PETRINAUT_CHAT_ROUTE, (c) =>
  petrinautChatHandler(c.req.raw),
);

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
