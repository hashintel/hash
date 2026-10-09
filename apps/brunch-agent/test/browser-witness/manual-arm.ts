/**
 * Manual witness for the `manual` guidance arm: the built website's Brunch
 * panel in real Chrome against the built Brunch app, with scripted OpenAI
 * responses only. Each case reports PASS, FAIL or a measured duration, and
 * every case runs even when an earlier one fails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

import { netCalls } from "../../src/conversation/net-changes.ts";
import { loadBuiltBrunchApplication } from "../load-built-application.ts";
import {
  installFauxOpenai,
  openaiCallId,
  openBrowserFixture,
  prepareWitnessProcess,
  toolCall,
} from "./browser-fixture.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

prepareWitnessProcess("browser-witness-manual");
// The agent module reads the arm once, when the built app loads.
process.env.BRUNCH_GUIDANCE_VARIANT = "manual";
const faux = installFauxOpenai();

const app = await loadBuiltBrunchApplication();
const fixture = await openBrowserFixture(app);

/** The final net of persona run run-0cuMkw (service-reservoir-overflow, manual arm). */
const hillcrestNet = JSON.parse(
  readFileSync(new URL("fixtures/hillcrest-net.json", import.meta.url), "utf8"),
) as SDCPN;
const savedDocument = (id: string, sdcpn: SDCPN) => ({
  [id]: {
    id,
    incarnationId: `${id}-incarnation`,
    revisionId: `${id}-revision`,
    title: "Hillcrest",
    lastUpdated: "2020-01-01T00:00:00.000Z",
    sdcpn,
  },
});

/** A recorded ledger2 commit reaches the panel's Ledger tab. */
const ledgerTabShowsCommit = async () => {
  const page = await fixture.openAssistant();
  faux.setResponses([
    toolCall(
      "ledger_commit",
      {
        entries: [
          [
            "entity/create",
            {
              name: "Hillcrest service reservoir",
              kind: "resource",
              origin: "stated",
              status: "confirmed",
            },
          ],
          [
            "claim/create",
            {
              text: "Hillcrest overflowed three times this summer.",
              entities: ["$0"],
              origin: "stated",
              status: "confirmed",
            },
          ],
        ],
      },
      "commit-1",
    ),
    fauxAssistantMessage([fauxText("Recorded the reservoir.")]),
  ]);
  const delivery = await fixture.ask(
    page,
    "Hillcrest service reservoir overflowed three times this summer.",
    "Recorded the reservoir.",
    60_000,
  );
  const { client } = await fixture.conversationOf(page, delivery);
  const committed = (await client.history()).messages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "dynamic-tool" && part.toolName === "ledger_commit",
    );
  assert.equal(
    (committed as { output?: { status?: string } } | undefined)?.output?.status,
    "recorded",
    "the commit itself must be recorded",
  );
  await page.getByRole("tab", { name: "Ledger" }).click();
  await page
    .getByText("Hillcrest service reservoir", { exact: true })
    .first()
    .waitFor({ timeout: 10_000 });
};

const baseRequest = {
  scenarioId: "summer_nights_levers",
  runCount: 1,
  seed: 20261008,
  maxTime: 720,
  metricIds: [
    "overflow_event_count",
    "fire_reserve_breach_count",
    "low_morning_event_count",
    "reservoir_level_m",
    "pump_running",
  ],
};
const fixedValues = {
  cut_out_level_m: { mode: "fixed", value: 5.4 },
  enable_vsd: { mode: "fixed", value: 1 },
  vsd_margin_lps: { mode: "fixed", value: 7.5 },
  initial_level_m: { mode: "fixed", value: 5 },
  start_hour: { mode: "fixed", value: 0 },
  night_demand_lps: { mode: "fixed", value: 20 },
  morning_peak_demand_lps: { mode: "fixed", value: 80 },
};

/** Times one direct createExperiment on the Hillcrest net; undefined when it outlasts the cap. */
const timeExperiment = async (
  label: string,
  experiment: Record<string, unknown>,
  capMs: number,
) => {
  const page = await fixture.openAssistant(
    "/",
    savedDocument(label, hillcrestNet),
  );
  const reply = `${label} finished.`;
  faux.setResponses([
    toolCall("getLatestNetDefinition", {}, `${label}-read`),
    toolCall("createExperiment", experiment, `${label}-run`),
    fauxAssistantMessage([fauxText(reply)]),
  ]);
  const started = performance.now();
  try {
    const delivery = await fixture.ask(
      page,
      `Run the ${label} experiment.`,
      reply,
      capMs,
    );
    const elapsed = performance.now() - started;
    const { client } = await fixture.conversationOf(page, delivery);
    const result = netCalls(await client.history()).find(
      ({ toolCallId }) => toolCallId === openaiCallId(`${label}-run`),
    );
    return {
      elapsedMs: Math.round(elapsed),
      status: (result?.output as { status?: string } | undefined)?.status,
    };
  } catch {
    return { elapsedMs: undefined, status: `exceeded ${capMs / 1000} s` };
  } finally {
    await page.close();
  }
};

const experimentTimings = async () => {
  const cases = [
    {
      label: "simulate-dt1",
      experiment: {
        ...baseRequest,
        name: "Fixed VSD setting, minute steps",
        scenarioParameterValues: fixedValues,
        dt: 1,
        execution: { mode: "simulate" },
      },
    },
    {
      label: "simulate-dt001",
      experiment: {
        ...baseRequest,
        name: "Fixed VSD setting, run-0cuMkw resolution",
        scenarioParameterValues: fixedValues,
        dt: 0.01,
        execution: { mode: "simulate" },
      },
    },
    {
      label: "optimize-run-0cuMkw",
      experiment: {
        ...baseRequest,
        name: "VSD margin sweep over 30 summer nights",
        scenarioParameterValues: {
          ...fixedValues,
          vsd_margin_lps: { mode: "range", min: 5, max: 10 },
        },
        dt: 0.01,
        execution: {
          mode: "optimize",
          objectiveMetricId: "overflow_event_count",
          direction: "minimize",
          steps: 6,
          runsPerStep: 1,
        },
      },
    },
  ];
  for (const { label, experiment } of cases) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- The cases share one scripted response queue.
    const timing = await timeExperiment(label, experiment, 180_000);
    process.stdout.write(
      `TIMING ${label}: ${timing.elapsedMs ?? "-"} ms, ${timing.status}\n`,
    );
  }
};

const failures: string[] = [];
try {
  for (const witness of [ledgerTabShowsCommit, experimentTimings]) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- The cases share one scripted response queue.
      await witness();
      process.stdout.write(`PASS ${witness.name}\n`);
    } catch (error) {
      failures.push(witness.name);
      process.stdout.write(`FAIL ${witness.name}: ${String(error)}\n`);
    }
  }
  process.stdout.write(
    `${JSON.stringify({ errors: fixture.errors, blocked: fixture.blocked })}\n`,
  );
  assert.deepEqual(failures, []);
  process.stdout.write("BROWSER_WITNESS_MANUAL_PASS\n");
} finally {
  try {
    await fixture.close();
  } finally {
    await app.stop();
  }
}
