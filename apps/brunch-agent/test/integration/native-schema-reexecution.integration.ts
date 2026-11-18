/**
 * Durable re-execution of a natively validated tool after a crash, through a
 * real Flue runtime on a persistent SQLite store. Phase `create` kills the
 * process inside the tool's run, before its outcome is recorded; phase
 * `recover` boots again, and Flue re-executes the durable call from its
 * retained raw arguments. Spawned by `native-schema-reexecution.test.ts`.
 */
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { defineTool, useModel, useTool } from "@flue/runtime";
import { sqlite, start } from "@flue/runtime/node";
import { createAgentRouter } from "@flue/runtime/routing";
import { type AgentSendResult, createFlueClient } from "@flue/sdk";

import { draftPetrinautExperimentInputSchema } from "@hashintel/brunch-agent";

const directory = process.env.NATIVE_REEXECUTION_DIRECTORY;
assert(directory);
const phase = process.env.NATIVE_REEXECUTION_PHASE;
assert(phase === "create" || phase === "recover");
const record = (event: Record<string, unknown>) =>
  appendFileSync(
    join(directory, "events.jsonl"),
    `${JSON.stringify({ phase, ...event })}\n`,
  );

/** The raw call: `blocksRun` is omitted, so only the native parse supplies it. */
const rawDraft = {
  experiment: {
    name: "Vans on the parcel route",
    scenarioId: "scenario-peak",
    scenarioParameterValues: { vans: { mode: "range", min: 2, max: 8 } },
    runCount: 40,
    seed: 7,
    dt: 0.5,
    maxTime: 120,
    metricIds: ["metric-wait", "metric-late"],
    execution: {
      mode: "optimize",
      objectiveMetricId: "metric-wait",
      direction: "minimize",
      steps: 10,
      runsPerStep: 4,
    },
  },
  declarations: [{ subject: "maxTime", statement: "120 model minutes." }],
  unsupported: [
    {
      condition: "No parcel may wait more than 30 minutes.",
      reason: "The request carries no constraints.",
      reportedByMetricId: "metric-late",
    },
  ],
};

const countedSchema = {
  "~standard": {
    ...draftPetrinautExperimentInputSchema["~standard"],
    validate: (value: unknown) => {
      record({ event: "validate" });
      return draftPetrinautExperimentInputSchema["~standard"].validate(value);
    },
  },
} as unknown as typeof draftPetrinautExperimentInputSchema;

const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1" }] });
faux.setResponses(
  phase === "create"
    ? [
        fauxAssistantMessage(
          [fauxToolCall("durable_draft", rawDraft, { id: "draft-durable" })],
          { stopReason: "toolUse" },
        ),
      ]
    : [fauxAssistantMessage("Recovered.")],
);

function NativeReexecutionAgent() {
  useModel("faux/faux-1");
  useTool(
    defineTool({
      name: "durable_draft",
      description: "Record one draft durably.",
      input: countedSchema,
      durable: true,
      run: ({ data }) => {
        record({ event: "run", data });
        if (phase === "create") process.kill(process.pid, "SIGKILL");
        return {
          output: { blocksRun: data.unsupported[0]?.blocksRun ?? null },
        };
      },
    }),
  );
  return "Native re-execution agent.";
}
NativeReexecutionAgent.agentName = "native-reexecution";

const flue = await start({
  agents: [NativeReexecutionAgent],
  providers: [faux.provider],
  db: sqlite(join(directory, "conversation.db")),
});
const router = createAgentRouter(NativeReexecutionAgent);
const client = createFlueClient({
  url: "http://flue.test/native-reexecution",
  fetch: async (input, init) =>
    router.fetch(input instanceof Request ? input : new Request(input, init)),
});
const receiptPath = join(directory, "receipt.json");
try {
  if (phase === "create") {
    const receipt = await client.send({
      message: { kind: "user", body: "Draft durably." },
    });
    writeFileSync(receiptPath, JSON.stringify(receipt));
    await client.wait(receipt, { signal: AbortSignal.timeout(30_000) });
    record({ event: "create-settled-without-crash" });
  } else {
    const receipt = JSON.parse(
      readFileSync(receiptPath, "utf8"),
    ) as AgentSendResult;
    // The crashed attempt's lease must expire before the coordinator resumes it.
    await client.wait(receipt, { signal: AbortSignal.timeout(100_000) });
    const history = await client.history();
    record({
      event: "history",
      tools: history.messages
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "dynamic-tool"),
    });
  }
} finally {
  await flue.stop();
}
