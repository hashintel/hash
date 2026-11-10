/**
 * A server process of the restart-turn proof: the real wiring
 * (`startDurableAgentsServer`) on the compose Postgres, on a free port, with a
 * scripted model for its role.
 *
 * - `issue`: the model reads the net, then calls `addPlace` (server 1, which
 *   the driver kills); net freshness admits the change against the read.
 * - `answer`: the model answers the browser's result (server 2).
 *
 * Reports `listening` with its port; on SIGTERM it closes, then reports
 * `stopped` with how many model requests it made.
 */
import { Pool } from "pg";

import { startDurableAgentsServer } from "../../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { report } from "../../browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../scripted-model";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

/** A canonical net mutation: `browserToolMutatesDocument` is true for it. */
export const toolName = "addPlace";

export const placeInput = {
  id: "washer",
  name: "Washer",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 120,
  y: 80,
};

export const answer = "I added the Washer place to the net.";

/** The net read before the change, and what the browser answers it with. */
export const readToolName = "readNetOutline";
export const readOutput = { title: "Laundry" };
export const readMetadata = { documentRevision: { before: "r1" } };

const responses: Record<string, FauxResponseStep[]> = {
  issue: [
    fauxAssistantMessage(fauxToolCall(readToolName, {}), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall(toolName, placeInput), {
      stopReason: "toolUse",
    }),
  ],
  answer: [fauxAssistantMessage(answer)],
};

export const serve = async (role: string) => {
  const script = responses[role];
  if (script === undefined) throw new Error(`Unknown server role ${role}.`);
  const { models, model, state } = scriptedModel(script);
  const pool = new Pool(postgresConfigFromEnvironment());
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
  });
  report("listening", { port: server.port });
  process.once("SIGTERM", () => {
    void (async () => {
      await server.close();
      await pool.end();
      report("stopped", { requests: state.callCount });
    })();
  });
};
