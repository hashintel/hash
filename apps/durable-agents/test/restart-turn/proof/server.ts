/**
 * A server process of the restart-turn proof: the real wiring
 * (`startDurableAgentsServer`) on the compose Postgres, on a free port, with a
 * scripted model for its role.
 *
 * - `issue`: the model reads the net, then calls `petrinaut_create_place`
 *   (server 1, which the driver kills); net freshness admits the change
 *   against the read.
 * - `answer`: the model answers the browser's result (server 2).
 *
 * Reports `listening` with its port; on SIGTERM it closes, then reports
 * `stopped` with how many model requests it made.
 */
import { Harness, ROOT_CONVERSATION_ID } from "@earendil-works/pi-durable";
import { Pool } from "pg";

import { hashProcessEditorId } from "@hashintel/brunch-agent";

import { BrowserCallsDoc } from "../../../src/browser-call/browser-call";
import { startDurableAgentsServer } from "../../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../../src/storage/postgres/postgres-config";
import { report } from "../../browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../scripted-model";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

/** HASH's create-place tool: `browserToolFacts` counts it as a change. */
export const toolName = "petrinaut_create_place";

export const placeInput = {
  editor_id: hashProcessEditorId,
  id: "washer",
  name: "Washer",
  colorId: null,
  dynamicsEnabled: false,
  x: 120,
  y: 80,
};

export const answer = "I added the Washer place to the net.";
export const failedAnswer = "I could not confirm the Washer place was added.";

/** The net read before the change, and what the browser answers it with. */
export const readToolName = "petrinaut_get_net";
const readInput = { editor_id: hashProcessEditorId, detail: "outline" };
export const readOutput = { title: "Laundry" };
export const readMetadata = { documentRevision: { before: "r1" } };

const responses: Record<string, FauxResponseStep[]> = {
  issue: [
    fauxAssistantMessage(fauxToolCall(readToolName, readInput), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(fauxToolCall(toolName, placeInput), {
      stopReason: "toolUse",
    }),
  ],
  answer: [fauxAssistantMessage(answer)],
  "answer-failure": [fauxAssistantMessage(failedAnswer)],
};

export const serve = async (role: string) => {
  const atCommit = role === "issue-at-commit";
  const script = responses[atCommit ? "issue" : role];
  if (script === undefined) throw new Error(`Unknown server role ${role}.`);
  if (atCommit) {
    // This process is test-owned. Pause the real HTTP result/fail path after
    // its outcome commit has returned, but before the scheduler marks the wake.
    const open = Harness.open.bind(Harness);
    Harness.open = async (...args) => {
      const harness = await open(...args);
      const abortTask = harness.abortTask.bind(harness);
      harness.abortTask = async (id, context) => {
        const record = Object.values(
          (
            await harness.snapshot(
              BrowserCallsDoc,
              ROOT_CONVERSATION_ID,
              context,
            )
          )?.calls ?? {},
        ).find((call) => call.toolName === toolName && call.doorbell === id);
        if (record !== undefined) {
          const task = await harness.getTask(id, context);
          report("before-wake", {
            status: record.status,
            task: task?.state.status,
            marked: task?.abortRequested ?? false,
          });
          await new Promise<never>(() => {});
        }
        return abortTask(id, context);
      };
      return harness;
    };
  }
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
