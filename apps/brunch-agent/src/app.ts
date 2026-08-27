/**
 * The app's route map — one plain Flue chat agent plus Petrinaut's /api/chat door.
 *
 * `/api/chat` requires `x-brunch-principal` and hashes principal + conversation
 * id into the Flue instance id, so `/agents/chat/:id` is unguessable without
 * both. The stock Flue UI at `/` uses a random UUID on the same router.
 */

import { readFile } from "node:fs/promises";

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { instrument } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";

import { ChatAgent } from "./agents/chat-agent.ts";
import { assetHandler } from "./assets.ts";
import { petrinautChatHandler } from "./petrinaut-chat.ts";
import { CHAT_AGENT_ROUTE, PETRINAUT_CHAT_ROUTE } from "./routes.ts";

instrument(createOpenTelemetryInstrumentation({ content: false }));

const app = new Hono();

app.route(`/agents/${CHAT_AGENT_ROUTE}`, createAgentRouter(ChatAgent));

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
