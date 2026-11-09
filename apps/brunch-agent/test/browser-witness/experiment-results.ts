/**
 * Run a reviewed draft in the real editor, then explain and question its results.
 *
 * yarn workspace @apps/brunch-agent test:manual:browser:experiment-results
 * Add --live only with model/spend approval: up to three turns on Brunch's
 * configured model. Scripted mode checks wiring, not explanation quality.
 * Both modes retain history and screenshots in the printed temporary folder.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import { agentOwnershipHeaders } from "@hashintel/brunch-agent";
import { toPetrinautId, type SDCPN } from "@hashintel/petrinaut-core";
import { petrinautExperimentResultSchema } from "@hashintel/petrinaut-core/experiments";

import { submitPersonaBrowserTurn } from "../../evals/petrinaut/persona/browser-turn.ts";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_THINKING,
} from "../../src/shared/chat-model.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

import type { Context } from "@earendil-works/pi-ai";
import type { AgentSendResult } from "@flue/sdk";

const live = process.argv.includes("--live");
const output = live
  ? mkdtempSync(join(tmpdir(), "experiment-results-live-"))
  : prepareWitnessProcess("experiment-results-scripted");
if (live) {
  process.env.NODE_ENV = "development";
  process.env.BRUNCH_DEV_DB_PATH = join(output, "conversation.db");
  process.env.BRUNCH_CHAT_MODEL ??= DEFAULT_CHAT_MODEL;
  process.env.BRUNCH_CHAT_THINKING ??= DEFAULT_CHAT_THINKING;
}
process.env.BRUNCH_DB_KIND = "sqlite";
process.env.BRUNCH_STEP_A_ACCOUNTING = "";
process.env.OTEL_SDK_DISABLED = "true";
delete process.env.HASH_OTLP_ENDPOINT;

const documentId = toPetrinautId("experiment-results-net");
const net: SDCPN = {
  places: ["Waiting", "Completed"].map((name, index) => ({
    id: name.toLowerCase(),
    name,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: index * 200,
    y: 0,
  })),
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  scenarios: [
    {
      id: "snapshot",
      name: "Snapshot",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: {
        type: "per_place",
        content: { waiting: "7", completed: "3" },
      },
    },
  ],
  metrics: [
    {
      id: "waiting-count",
      name: "Waiting orders",
      code: "return state.places.Waiting.count;",
    },
    {
      id: "completed-count",
      name: "Completed orders",
      code: "return state.places.Completed.count;",
    },
  ],
};

const opening =
  "This saved net is a static snapshot of orders: Waiting and Completed are order counts, and there are deliberately no transitions. I want a baseline report, not optimisation or a model change. Please draft one simulation named Order snapshot using the saved Snapshot scenario and both saved metrics, two runs, seed 42, dt 1 and maxTime 1. There are no restrictions or tunable levers. I will review and run it, then ask about the results.";
const followUp =
  "Using the experiment that just finished, what percentage of the orders are completed, and how many are still waiting? Does that tell us how quickly we process orders? Answer from these results without running another experiment or changing the model.";
const interpretation =
  "The finished experiment reports 7 waiting orders and 3 completed orders. This static snapshot does not measure processing speed.";
const answer =
  "3 of 10 orders are completed, or 30%; 7 are still waiting. With no transitions, this snapshot cannot tell us processing speed.";

/** The product's result turn must arrive at the model, not just appear in the UI. */
const resultFromText = (text: string) => {
  const result =
    /The experiment I chose to run has finished\.[\s\S]*?\n\n(?<result>\{[^\n]+\})/u.exec(
      text,
    )?.groups?.result;
  assert(result, "The completed experiment's result turn is missing");
  return petrinautExperimentResultSchema.parse(JSON.parse(result));
};
const assertResult = (text: string) => {
  const result = resultFromText(text);
  assert.equal(result.status, "complete");
  assert.equal(result.name, "Order snapshot");
  assert.equal(result.runsCompleted, 2);
  assert(result.experimentId);
  assert.deepEqual(
    Object.fromEntries(result.metrics.map(({ id, value }) => [id, value])),
    {
      [toPetrinautId("waiting-count")]: 7,
      [toPetrinautId("completed-count")]: 3,
    },
  );
  return result;
};
const userContext = (context: Context) =>
  context.messages
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n"),
    )
    .join("\n");

if (!live) {
  const faux = installFauxOpenai();
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, "read-net"),
    toolCall(
      "draft_petrinaut_experiment",
      {
        experiment: {
          name: "Order snapshot",
          scenarioId: "snapshot",
          scenarioParameterValues: {},
          runCount: 2,
          seed: 42,
          dt: 1,
          maxTime: 1,
          metricIds: ["waiting-count", "completed-count"],
          execution: { mode: "simulate" },
        },
        declarations: [
          {
            subject: "scope",
            statement: "Static order counts, not processing speed.",
          },
        ],
        unsupported: [],
      },
      "draft",
    ),
    fauxAssistantMessage([fauxText("The draft is ready for your review.")]),
    (context: Context) => {
      assertResult(userContext(context));
      return fauxAssistantMessage([fauxText(interpretation)]);
    },
    (context: Context) => {
      assertResult(userContext(context));
      assert(userContext(context).includes(followUp));
      assert(
        context.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.content.some(
              (part) => part.type === "text" && part.text === interpretation,
            ),
        ),
      );
      return fauxAssistantMessage([fauxText(answer)]);
    },
  ]);
}

process.stdout.write(
  `${live ? "LIVE" : "SCRIPTED"} experiment-results witness: ${output}\n`,
);
const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);
let client: ReturnType<typeof createFlueClient> | undefined;
try {
  const page = await fixture.openAssistant("/", {
    [documentId]: {
      id: documentId,
      revisionId: "initial-revision",
      title: "Order snapshot",
      lastUpdated: "2020-01-01T00:00:00.000Z",
      sdcpn: net,
    },
  });
  page.setDefaultTimeout(15_000);
  const draft = await submitPersonaBrowserTurn(page, opening, {
    signal: AbortSignal.timeout(300_000),
  });
  client = createFlueClient({
    url: draft.session.url,
    headers: agentOwnershipHeaders(draft.session),
  });
  process.stdout.write(`DRAFT: ${draft.reply.text}\n`);
  const card = page.getByRole("region", { name: "Drafted experiment" });
  await card.getByRole("button", { name: "Run", exact: true }).waitFor();
  const beforeRun = await fixture.storedDocument(page, documentId);
  const resultAdmission = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === draft.session.url,
    { timeout: 60_000 },
  );
  await card.getByRole("button", { name: "Run", exact: true }).click();
  const delivered = await resultAdmission;
  assert.equal(delivered.status(), 202);
  const receipt = (await delivered.json()) as AgentSendResult;
  const explanation = await client.read(receipt, {
    signal: AbortSignal.timeout(300_000),
  });
  assert(explanation.text.trim(), "The result turn has no explanation");
  await page
    .getByRole("button", { name: "Stop AI response", exact: true })
    .waitFor({ state: "hidden", timeout: 30_000 });
  if (!live) await page.getByText(interpretation, { exact: true }).waitFor();
  process.stdout.write(`EXPLANATION: ${explanation.text}\n`);
  await page.screenshot({
    path: join(output, "explanation.png"),
    fullPage: true,
  });

  const follow = await submitPersonaBrowserTurn(page, followUp, {
    session: draft.session,
    signal: AbortSignal.timeout(300_000),
  });
  if (!live) await page.getByText(answer, { exact: true }).waitFor();
  process.stdout.write(`FOLLOW-UP: ${follow.reply.text}\n`);
  await page.screenshot({
    path: join(output, "follow-up.png"),
    fullPage: true,
  });
  const history = await client.history();
  const resultTurns = history.messages.filter(
    (message) =>
      message.role === "user" &&
      message.parts.some(
        (part) =>
          part.type === "text" &&
          part.text.includes("The experiment I chose to run has finished."),
      ),
  );
  assert.equal(resultTurns.length, 1, "Results must be delivered exactly once");
  const resultText = resultTurns
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      ),
    )
    .join("\n");
  const result = assertResult(resultText);
  assert.equal(history.settlements.length, 3);
  assert(history.settlements.every(({ outcome }) => outcome === "completed"));
  const experimentCalls = history.messages
    .flatMap((message) => message.parts)
    .filter(
      (part) =>
        part.type === "dynamic-tool" &&
        ["draft_petrinaut_experiment", "createExperiment"].includes(
          part.toolName,
        ),
    );
  assert.equal(
    experimentCalls.length,
    1,
    "Answering about results must not start another experiment",
  );
  assert.deepEqual(await fixture.storedDocument(page, documentId), beforeRun);
  assert.deepEqual(fixture.errors, []);
  assert.deepEqual(fixture.blocked, []);
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(
      {
        mode: live ? "live" : "scripted",
        model: live ? process.env.BRUNCH_CHAT_MODEL : "faux-openai",
        thinking: live ? process.env.BRUNCH_CHAT_THINKING : undefined,
        result,
        explanation: explanation.text,
        followUp,
        answer: follow.reply.text,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `${live ? "LIVE_RESULTS_RECORDED_REVIEW_REQUIRED" : "EXPERIMENT_RESULTS_WITNESS_PASS"}\n`,
  );
} finally {
  try {
    if (client) {
      await client.abort();
      writeFileSync(
        join(output, "history.json"),
        JSON.stringify(await client.history(), null, 2),
      );
    }
  } finally {
    try {
      await fixture.close();
    } finally {
      await app.stop();
    }
  }
}
