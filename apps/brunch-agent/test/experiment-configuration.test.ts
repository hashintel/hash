// Live probes need BRUNCH_LIVE_MODEL_TESTS=1 and the chat model's API key.
import { readFileSync } from "node:fs";

import { createModels, type Context } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { describe, expect, test } from "vitest";

import {
  petrinautExperimentRequestSchema,
  type PetrinautExperimentRequest,
} from "@hashintel/petrinaut-core";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../src/chat-model.ts";
import { openaiProviderWithAddedModels } from "../src/openai-provider.ts";

const reference = readFileSync(
  new URL(
    "../src/agents/chat-agent/guidance/manual/skills/modelling/references/experiment-configuration.md",
    import.meta.url,
  ),
  "utf8",
);

const scenarioId = "6e792c42-acc9-5f43-8f94-0386e6271503";
const overflowCountId = "c79083a2-abca-5ab2-b891-a229fa69e604";
const peakLevelId = "5d0f3a4e-2b7c-5e1a-9c3d-7f8e6a5b4c21";
const minHeadroomId = "33183274-404a-57ff-acb1-237b7a3cc566";

const net = {
  title: "Hillcrest reservoir overflow options",
  scenarios: [
    {
      id: scenarioId,
      name: "Summer night from 4:10",
      parameters: [
        { identifier: "vsd_speed_fraction", type: "ratio", default: 1 },
        { identifier: "cut_out_level_m", type: "real", default: 5.4 },
        { identifier: "initial_level_m", type: "real", default: 5.2 },
        { identifier: "initial_indicated_level_m", type: "real", default: 5.2 },
        { identifier: "initial_comms_ok", type: "boolean", default: false },
      ],
    },
  ],
  metrics: [
    {
      id: overflowCountId,
      name: "Overflow count",
      kind: "accumulated count of weir crossings",
    },
    {
      id: peakLevelId,
      name: "Peak physical level",
      kind: "peak of the physical level over the run, in metres",
    },
    {
      id: minHeadroomId,
      name: "Lowest headroom above fire reserve",
      kind: "minimum over the run, in metres",
    },
  ],
};

const ledger = `- Purpose (confirmed): Gwen must recommend lowering the pump cut-out from 5.4 m or fitting a variable speed drive, to stop early-morning overflows at the 5.8 m weir.
- The booster PLC stops the pump on the last level received by radio every 5 minutes; comms-fail alarms come and go on summer nights (confirmed).
- Horizon (confirmed): one night from 4:10 to 9:00, 17,400 s; the model's time unit is seconds.
- Fire reserve 1.5 m (confirmed threshold): reported, not enforced.
- A run at the current settings reproduced the overflow (obligation discharged).
- Stand-in (assumed, agent's choice): every run starts with the physical and indicated level both at 5.2 m and the radio already down. Nobody knows when the radio dropped relative to the level on the incident nights.`;

const createExperimentParameters = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "scenarioId",
    "scenarioParameterValues",
    "runCount",
    "seed",
    "dt",
    "maxTime",
    "metricIds",
    "execution",
  ],
  properties: {
    name: { type: "string" },
    scenarioId: { type: "string" },
    scenarioParameterValues: {
      type: "object",
      description:
        "Scenario parameter identifiers mapped to { mode: 'fixed', value } or { mode: 'range', min, max }. Omitted parameters use their saved defaults.",
      additionalProperties: {
        type: "object",
        properties: {
          mode: { enum: ["fixed", "range"] },
          value: { type: ["number", "boolean"] },
          min: { type: "number" },
          max: { type: "number" },
        },
        required: ["mode"],
      },
    },
    runCount: { type: "integer" },
    seed: { type: "integer" },
    dt: { type: "number" },
    maxTime: { type: "number" },
    metricIds: { type: "array", items: { type: "string" } },
    execution: {
      type: "object",
      description:
        "{ mode: 'simulate' }, or { mode: 'optimize', objectiveMetricId, direction: 'minimize' | 'maximize', steps, runsPerStep }.",
      properties: {
        mode: { enum: ["simulate", "optimize"] },
        objectiveMetricId: { type: "string" },
        direction: { enum: ["minimize", "maximize"] },
        steps: { type: "integer" },
        runsPerStep: { type: "integer" },
      },
      required: ["mode"],
    },
  },
};

const live = process.env.BRUNCH_LIVE_MODEL_TESTS === "1";

const fixedNumber = (
  request: PetrinautExperimentRequest,
  identifier: string,
  fallback: number,
) => {
  const value = request.scenarioParameterValues[identifier];
  return value?.mode === "fixed" && typeof value.value === "number"
    ? value.value
    : fallback;
};

/** Mimics the draft net: with the radio down, the pump stops only if the stale reading already passes the cut-out. */
const stubResult = (request: PetrinautExperimentRequest) => {
  const stopped =
    fixedNumber(request, "initial_indicated_level_m", 5.2) >=
    fixedNumber(request, "cut_out_level_m", 5.4);
  const speed = fixedNumber(request, "vsd_speed_fraction", 1);
  return {
    status: "complete",
    runsCompleted: request.runCount,
    metrics: [
      { id: overflowCountId, label: "Overflow count", value: stopped ? 0 : 1 },
      {
        id: peakLevelId,
        label: "Peak physical level",
        value: stopped ? 5.2 : 5.8 + 0.4 * speed,
      },
      {
        id: minHeadroomId,
        label: "Lowest headroom above fire reserve",
        value: 1.8,
      },
    ],
  };
};

describe
  .skipIf(!live)
  .concurrent("experiment configuration with a live model", () => {
    /** Sends one USER message, answers its experiments from the stub, and returns both turns' experiments and text. */
    const respond = async (message: string) => {
      const models = createModels();
      models.setProvider(anthropicProvider());
      models.setProvider(openaiProviderWithAddedModels());
      const specifier = selectChatModelSpecifier();
      const slash = specifier.indexOf("/");
      const model = models.getModel(
        specifier.slice(0, slash),
        specifier.slice(slash + 1),
      );
      if (!model) throw new Error(`Unknown model ${specifier}`);
      const thinking = selectChatThinking();
      const context: Context = {
        systemPrompt: `You are building and testing a Petrinaut model with the USER. Follow this reference for experiments:\n\n<reference>\n${reference}\n</reference>\n\nThe current net, from the latest read:\n\n${JSON.stringify(net, null, 2)}\n\nThe Ledger so far:\n\n${ledger}\n\nRun the experiments you would run now by calling createExperiment once per experiment, all in this response, and reply in text with anything the USER should read.`,
        messages: [{ role: "user", content: message, timestamp: Date.now() }],
        tools: [
          {
            name: "createExperiment",
            description:
              "Run an experiment on a saved scenario with saved metrics and return its result.",
            parameters: createExperimentParameters,
          },
        ],
      };
      const experiments: PetrinautExperimentRequest[] = [];
      const texts: string[] = [];
      for (let turn = 0; turn < 3; turn += 1) {
        // Each turn answers the previous one's experiments.
        // eslint-disable-next-line no-await-in-loop
        const response = await models.completeSimple(model, context, {
          reasoning: thinking === "off" ? undefined : thinking,
        });
        if (response.stopReason === "error")
          throw new Error(response.errorMessage ?? "Model request failed");
        texts.push(
          ...response.content.flatMap((block) =>
            block.type === "text" ? [block.text] : [],
          ),
        );
        const calls = response.content.flatMap((block) =>
          block.type === "toolCall" ? [block] : [],
        );
        if (calls.length === 0) break;
        context.messages.push(response);
        for (const call of calls) {
          const parsed = petrinautExperimentRequestSchema.safeParse(
            call.arguments,
          );
          if (parsed.success) experiments.push(parsed.data);
          context.messages.push({
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [
              {
                type: "text",
                text: parsed.success
                  ? JSON.stringify(stubResult(parsed.data))
                  : parsed.error.message,
              },
            ],
            isError: !parsed.success,
            timestamp: Date.now(),
          });
        }
      }
      return { experiments, text: texts.join("\n") };
    };

    test("searches a lever on a continuous margin, not on an event count", async () => {
      const { experiments } = await respond(
        "I don't know the pump's technical lower limit; 50% feels like a sensible minimum. Can you just try a range of speeds and show me which one avoids the overflow?",
      );
      const searches = experiments.filter(
        ({ execution }) => execution.mode === "optimize",
      );
      expect(searches.length, JSON.stringify(experiments)).toBeGreaterThan(0);
      for (const { execution, metricIds } of searches) {
        if (execution.mode !== "optimize") continue;
        expect(execution.objectiveMetricId).not.toBe(overflowCountId);
        expect(metricIds).toContain(overflowCountId);
      }
    }, 120_000);

    test("does not let a stand-in starting state decide an option comparison", async () => {
      const { experiments, text } = await respond(
        "Now compare the two options properly: cut-out at 5.0 m with the pump at full speed, against the drive at 60% with the cut-out left at 5.4 m.",
      );
      const variesStart = experiments.some(({ scenarioParameterValues }) => {
        const start = scenarioParameterValues.initial_indicated_level_m;
        return (
          start !== undefined && (start.mode === "range" || start.value !== 5.2)
        );
      });
      const namesStart = text
        .split(/(?<=[.!?])\s+/u)
        .some(
          (sentence) =>
            /start|initial|already/iu.test(sentence) &&
            /cut-?out|5\.0/iu.test(sentence) &&
            /above|past|over|decid|settl/iu.test(sentence),
        );
      expect(
        variesStart || namesStart,
        `${text}\n${JSON.stringify(experiments.map(({ scenarioParameterValues }) => scenarioParameterValues))}`,
      ).toBe(true);
    }, 120_000);
  });
