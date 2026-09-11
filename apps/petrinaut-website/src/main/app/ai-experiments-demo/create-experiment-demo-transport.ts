import { generateId, type UIMessageChunk } from "ai";

import {
  createExperimentToolName,
  type PetrinautExperimentRequest,
  type PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";

import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";

const percentage = (value: number) =>
  `${(value * 100).toLocaleString("en", { maximumFractionDigits: 2 })}%`;

const describeResult = (result: PetrinautExperimentResult): string => {
  if (result.status !== "complete") {
    const status =
      result.status === "cancelled" ? "was cancelled" : "could not finish";
    return `The experiment ${status} after ${result.runsCompleted} completed runs. ${result.message ?? "Send another request to try again."}`;
  }
  const infectedShare = result.metrics.find(
    (metric) => metric.id === "metric__infected_fraction",
  )?.value;
  const selectedShare = result.optimization?.parameters.infected_ratio;
  const selection =
    typeof selectedShare === "number"
      ? `The search selected ${percentage(selectedShare)} initially infected. `
      : "";
  const metric =
    infectedShare == null
      ? "No infected-share metric was returned."
      : `Last sampled mean infected share: ${percentage(infectedShare)}.`;
  return `${selection}${result.runsCompleted} runs finished. ${metric} Open the experiment to explore the distribution.`;
};

const delay = (duration: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, duration);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });

export const createExperimentDemoTransport = (): PetrinautAiChatTransport => ({
  reconnectToStream: () => Promise.resolve(null),
  sendMessages: ({ messages, abortSignal }) => {
    const lastUserIndex = messages.findLastIndex(
      (message) =>
        message.role === "user" &&
        message.id !== "petrinaut-diagnostics-context",
    );
    const prompt =
      messages[lastUserIndex]?.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" ") ?? "";
    const output = messages
      .slice(lastUserIndex + 1)
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          part.type === "tool-createExperiment" &&
          part.state === "output-available",
      );
    const concernsModel =
      /\b(outbreak|infected|infection|scenario|simulations?|experiments?)\b/i.test(
        prompt,
      );
    const command = prompt.trim().replace(/^please\s+/i, "");
    const optimize =
      /^optimi[sz]e\b/i.test(command) &&
      (concernsModel || /^optimi[sz]e[.!]?$/i.test(command));
    const simulate =
      /^run\b/i.test(command) && (concernsModel || /^run[.!]?$/i.test(command));
    const planning =
      /\b(how|what|can we|compare)\b/i.test(prompt) && concernsModel;
    const declined = /\b(don['’]t|do not|stop|cancel)\b/i.test(prompt);
    let text =
      "Try “run” for the outbreak baseline, or “optimize” to search starting infection levels. This demo uses a fixed recipe.";
    let request: PetrinautExperimentRequest | undefined;
    if (output) {
      text = describeResult(output.output);
    } else if ((optimize || simulate) && !declined) {
      request = {
        name: optimize ? "Starting infection search" : "Outbreak baseline",
        scenarioId: "scenario__seasonal_flu",
        scenarioParameterValues: {
          population: { mode: "fixed", value: 100 },
          infected_ratio: optimize
            ? { mode: "range", min: 0.01, max: 0.2 }
            : { mode: "fixed", value: 0.05 },
        },
        runCount: 256,
        seed: 42,
        dt: 0.01,
        maxTime: 20,
        metricIds: ["metric__infected_fraction"],
        execution: optimize
          ? {
              mode: "optimize",
              objectiveMetricId: "metric__infected_fraction",
              direction: "minimize",
              steps: 4,
              runsPerStep: 8,
            }
          : { mode: "simulate" },
      };
      text = optimize
        ? "This demo searches starting infection shares from 1% to 20% in a population of 100. I'll score four candidates with 8 runs each, then check the selected candidate with 256 runs over 20 model-time units."
        : "This demo runs 256 simulations over 20 model-time units, starting with 5 infected people out of 100. I'll keep the infected-share distribution.";
    } else if (planning && !declined) {
      text = /\b(starting|initial|compare|optimi\w*)\b/i.test(prompt)
        ? "We can compare starting infection shares from 1% to 20%, then check the selected candidate with 256 runs. Send “optimize” to search for the lowest last sampled mean infected share."
        : "We can repeat the Seasonal Flu scenario with 5 infected people out of 100, then compare the infected-share distributions. Send “run” to start 256 simulations.";
    }
    const cancellation = new AbortController();
    const abort = () => cancellation.abort(abortSignal?.reason);
    abortSignal?.addEventListener("abort", abort, { once: true });
    if (abortSignal?.aborted) abort();
    let readerCancelled = false;
    return Promise.resolve(
      new ReadableStream<UIMessageChunk>({
        async start(controller) {
          const { signal } = cancellation;
          const textId = generateId();
          try {
            signal.throwIfAborted();
            controller.enqueue({ type: "start-step" });
            await delay(350, signal);
            controller.enqueue({ type: "text-start", id: textId });
            const words = text.match(/\S+\s*/g) ?? [];
            for (const word of words) {
              signal.throwIfAborted();
              controller.enqueue({
                type: "text-delta",
                id: textId,
                delta: word,
              });
              await delay(
                /[.!?][”"]?\s*$/.test(word)
                  ? 170
                  : Math.min(55, 30 + word.length * 1.5),
                signal,
              );
            }
            controller.enqueue({ type: "text-end", id: textId });
            if (request) {
              await delay(250, signal);
              controller.enqueue({
                type: "tool-input-available",
                toolCallId: generateId(),
                toolName: createExperimentToolName,
                input: request,
              });
            }
            controller.enqueue({ type: "finish-step" });
            controller.enqueue({ type: "finish" });
            controller.close();
          } catch (error) {
            if (!readerCancelled) controller.error(error);
          } finally {
            abortSignal?.removeEventListener("abort", abort);
          }
        },
        cancel() {
          readerCancelled = true;
          cancellation.abort();
        },
      }),
    );
  },
});
