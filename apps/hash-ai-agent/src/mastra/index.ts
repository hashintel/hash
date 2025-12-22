/* eslint-disable canonical/filename-no-index */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chatRoute } from "@mastra/ai-sdk";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { Observability } from "@mastra/observability";

import { genericAgent } from "./agents/generic-agent";
import { nerAgent } from "./agents/ner-agent";
import { plannerAgent } from "./agents/planner-agent";
import { nerPeopleScorer } from "./scorers/ner-people-scorer";
import { nerPeopleWorkflow } from "./workflows/ner-people-workflow";

const metaFilename = fileURLToPath(import.meta.url);
const metaDirname = path.dirname(metaFilename);
const dbFilename = path.resolve(metaDirname, "../../data/mastra.db");

export const mastra = new Mastra({
  workflows: { nerPeopleWorkflow },
  agents: {
    nerAgent,
    genericAgent,
    plannerAgent,
  },
  scorers: { nerPeopleScorer },
  logger: new PinoLogger(),
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: pathToFileURL(dbFilename).toString(),
  }),
  observability: new Observability({
    default: { enabled: true },
  }),
  /**
   * Server configuration for the Mastra backend.
   *
   * The server runs on port 4111 (default) and exposes:
   * - Built-in API routes for agents, workflows, memory at /api/*
   * - Custom routes registered via apiRoutes array
   *
   * The chatRoute() helper from @mastra/ai-sdk creates an AI SDK v5 compatible
   * streaming endpoint that works with useChat() from @ai-sdk/react.
   */
  server: {
    port: 4111,
    // Allow requests from the Vite dev server (default port 5173)
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    },
    apiRoutes: [
      // AI SDK streaming chat endpoint
      // Usage: POST /chat/:agentId with { messages: [...] }
      // The :agentId param allows routing to any registered agent
      chatRoute({
        path: "/chat/:agentId",
        // Include reasoning steps in the stream (useful for debugging)
        sendReasoning: true,
      }),
    ],
  },
});
