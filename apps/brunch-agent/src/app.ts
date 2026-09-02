/**
 * The app's route map — one plain Flue chat agent plus Petrinaut's /api/chat door.
 *
 * Both doors require principal + conversation id. `/api/chat` takes the principal
 * header and body `id`; `/agents/chat/:id` takes the same principal plus
 * `x-brunch-conversation` and admits the request only when those re-derive the
 * path id. The Flue instance id is derived, not a bearer token.
 */

import { readFile } from "node:fs/promises";

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { agentOwnershipGuard } from "./agent-ownership.ts";
import { ChatAgent } from "./agents/chat-agent.ts";
import { assetHandler } from "./assets.ts";
import { petrinautChatHandler } from "./petrinaut-chat.ts";
import { CHAT_AGENT_ROUTE, PETRINAUT_CHAT_ROUTE } from "./routes.ts";

instrument(createOpenTelemetryInstrumentation({ content: false }));

const app = new Hono();

const chatAgentMount = `/agents/${CHAT_AGENT_ROUTE}`;
app.use(`${chatAgentMount}/*`, agentOwnershipGuard(`${chatAgentMount}/`));
app.route(chatAgentMount, createAgentRouter(ChatAgent));

app.on(["GET", "POST", "OPTIONS"], PETRINAUT_CHAT_ROUTE, (c) =>
  petrinautChatHandler(c.req.raw),
);

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
