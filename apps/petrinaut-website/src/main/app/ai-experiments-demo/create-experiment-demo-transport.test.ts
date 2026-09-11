import { readUIMessageStream, type UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  petrinautExperimentRequestSchema,
  type PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";

import { createExperimentDemoTransport } from "./create-experiment-demo-transport";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const startTurn = (messages: PetrinautAiMessage[], abortSignal?: AbortSignal) =>
  createExperimentDemoTransport().sendMessages({
    chatId: "demo",
    messages,
    trigger: "submit-message",
    messageId: undefined,
    abortSignal,
  });

const collect = async (
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  chunks: UIMessageChunk[] = [],
) => {
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return chunks;
    chunks.push(chunk.value);
  }
};

const readTurn = async (messages: PetrinautAiMessage[]) => {
  const stream = await startTurn(messages);
  const reading = collect(stream.getReader());
  await vi.runAllTimersAsync();
  return reading;
};

const responseText = (chunks: UIMessageChunk[]) =>
  chunks
    .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
    .join("");

const userMessage = (text: string): PetrinautAiMessage => ({
  id: `user-${text}`,
  role: "user",
  parts: [{ type: "text", text }],
});

const completedMessage = (
  output: Partial<PetrinautExperimentResult> = {},
): PetrinautAiMessage => ({
  id: "completed",
  role: "assistant",
  parts: [
    { type: "text", text: "Starting the experiment." },
    {
      type: "tool-createExperiment",
      toolCallId: "experiment-call",
      state: "output-available",
      input: petrinautExperimentRequestSchema.parse({
        name: "Outbreak baseline",
        scenarioId: "scenario__seasonal_flu",
        scenarioParameterValues: {},
        runCount: 256,
        seed: 42,
        dt: 0.01,
        maxTime: 20,
        metricIds: ["metric__infected_fraction"],
        execution: { mode: "simulate" },
      }),
      output: {
        status: "complete",
        experimentId: "experiment-1",
        name: "Outbreak baseline",
        runsCompleted: 173,
        metrics: [
          { id: "metric__unrelated", label: "Other", value: 0.99 },
          {
            id: "metric__infected_fraction",
            label: "Infected Fraction",
            value: 0.123456,
          },
        ],
        ...output,
      },
    },
  ],
});

describe("experiment integration demo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test.each([
    ["run", "simulate", "Outbreak baseline"],
    [
      "Run 256 simulations for 20 model-time units.",
      "simulate",
      "Outbreak baseline",
    ],
    ["optimize", "optimize", "Starting infection search"],
    [
      "Optimize for the lowest infected share.",
      "optimize",
      "Starting infection search",
    ],
  ] as const)(
    "emits a valid bounded request for %s",
    async (prompt, mode, name) => {
      const chunks = await readTurn([userMessage(prompt)]);
      const call = chunks.find(
        (chunk) => chunk.type === "tool-input-available",
      );
      expect(call?.toolName).toBe("createExperiment");
      const request = petrinautExperimentRequestSchema.parse(call?.input);
      expect(request).toMatchObject({
        name,
        runCount: 256,
        maxTime: 20,
        execution: { mode },
      });
      expect(responseText(chunks)).toContain("256");
      expect(responseText(chunks)).toContain("20 model-time units");
    },
  );

  test.each([
    ["How can I see the variation in this outbreak model?", "distributions"],
    ["Can we compare different starting infection levels?", "1% to 20%"],
    ["How do I run an experiment?", "distributions"],
    ["What does optimize do for an experiment?", "1% to 20%"],
  ] as const)("plans without launching for %s", async (prompt, phrase) => {
    const chunks = await readTurn([userMessage(prompt)]);
    expect(chunks.some((chunk) => chunk.type === "tool-input-available")).toBe(
      false,
    );
    expect(responseText(chunks)).toContain(phrase);
  });

  test.each([
    "Write a poem",
    "Optimize my website",
    "Run a shell command",
    "Do not run an experiment",
  ])("guides unsupported requests without launching: %s", async (prompt) => {
    const chunks = await readTurn([userMessage(prompt)]);
    expect(chunks.some((chunk) => chunk.type === "tool-input-available")).toBe(
      false,
    );
    expect(responseText(chunks)).toContain("fixed recipe");
  });

  test("states the fixed recipe when a requested count differs", async () => {
    const chunks = await readTurn([userMessage("Run 10 simulations")]);
    expect(responseText(chunks)).toContain("This demo runs 256 simulations");
  });

  test("pauses, streams words, then launches after its explanation", async () => {
    const stream = await startTurn([userMessage("run")]);
    const chunks: UIMessageChunk[] = [];
    const reading = collect(stream.getReader(), chunks);
    await vi.advanceTimersByTimeAsync(349);
    expect(chunks).toEqual([{ type: "start-step" }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(responseText(chunks)).toBe("This ");
    await vi.advanceTimersByTimeAsync(300);
    expect(responseText(chunks)).toMatch(/^This demo runs/);
    expect(chunks.some((chunk) => chunk.type === "tool-input-available")).toBe(
      false,
    );
    await vi.runAllTimersAsync();
    await reading;
    expect(
      chunks.findIndex((chunk) => chunk.type === "tool-input-available"),
    ).toBeGreaterThan(chunks.findIndex((chunk) => chunk.type === "text-end"));
  });

  test("reports the actual completed count and matching metric", async () => {
    const chunks = await readTurn([userMessage("run"), completedMessage()]);
    expect(responseText(chunks)).toContain(
      "173 runs finished. Last sampled mean infected share: 12.35%.",
    );
    expect(responseText(chunks)).not.toContain("99%");
    expect(chunks.some((chunk) => chunk.type === "tool-input-available")).toBe(
      false,
    );
  });

  test("reports the selected parameter from the completed optimization", async () => {
    const chunks = await readTurn([
      userMessage("optimize"),
      completedMessage({
        optimization: {
          parameters: { infected_ratio: 0.077 },
          objectiveValue: 0.123456,
          stepsCompleted: 4,
        },
      }),
    ]);
    expect(responseText(chunks)).toContain(
      "The search selected 7.7% initially infected.",
    );
    expect(responseText(chunks)).toContain("173 runs finished.");
    expect(responseText(chunks)).toContain("12.35%");
  });

  test.each([
    { metrics: [] },
    {
      metrics: [
        {
          id: "metric__infected_fraction",
          label: "Infected Fraction",
          value: null,
        },
      ],
    },
  ])(
    "reports missing metrics without inventing a value",
    async ({ metrics }) => {
      const chunks = await readTurn([
        userMessage("run"),
        completedMessage({ metrics }),
      ]);
      expect(responseText(chunks)).toContain(
        "No infected-share metric was returned.",
      );
      expect(responseText(chunks)).not.toContain("mean infected share:");
    },
  );

  test("preserves zero values and does not format a boolean as a selected share", async () => {
    const chunks = await readTurn([
      userMessage("optimize"),
      completedMessage({
        metrics: [
          {
            id: "metric__infected_fraction",
            label: "Infected Fraction",
            value: 0,
          },
        ],
        optimization: {
          parameters: { infected_ratio: false },
          objectiveValue: 0,
          stepsCompleted: 4,
        },
      }),
    ]);
    expect(responseText(chunks)).toContain("infected share: 0%.");
    expect(responseText(chunks)).not.toContain("search selected");
  });

  test.each(["cancelled", "error"] as const)(
    "reports a host %s result",
    async (status) => {
      const chunks = await readTurn([
        userMessage("run"),
        completedMessage({
          status,
          message: "The host stopped the experiment.",
        }),
      ]);
      expect(responseText(chunks)).toContain(
        status === "cancelled" ? "was cancelled" : "could not finish",
      );
      expect(responseText(chunks)).toContain("173 completed runs");
      expect(responseText(chunks)).toContain(
        "The host stopped the experiment.",
      );
      expect(responseText(chunks)).not.toContain("Last sampled mean");
    },
  );

  test("continues the same message and starts fresh for a later user request", async () => {
    const completed = completedMessage();
    const history = [userMessage("run"), completed];
    const reply = await readTurn(history);
    let continuedMessage = completed;
    for await (const update of readUIMessageStream({
      message: structuredClone(completed),
      stream: new ReadableStream({
        start(controller) {
          for (const chunk of reply) controller.enqueue(chunk);
          controller.close();
        },
      }),
      terminateOnError: true,
    })) {
      continuedMessage = update;
    }
    expect(continuedMessage.id).toBe(completed.id);
    expect(
      continuedMessage.parts.filter(
        (part) => part.type === "tool-createExperiment",
      ),
    ).toHaveLength(1);
    expect(
      continuedMessage.parts.filter((part) => part.type === "text"),
    ).toHaveLength(2);
    const next = await readTurn([...history, userMessage("optimize")]);
    expect(
      next.find((chunk) => chunk.type === "tool-input-available")?.toolCallId,
    ).not.toBe("experiment-call");
    expect(next.some((chunk) => chunk.type === "tool-input-available")).toBe(
      true,
    );
  });

  test.each([0, 800])(
    "aborts at %s ms without launching a later tool",
    async (duration) => {
      const cancellation = new AbortController();
      const stream = await startTurn([userMessage("run")], cancellation.signal);
      const chunks: UIMessageChunk[] = [];
      const reading = collect(stream.getReader(), chunks).catch(
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(duration);
      cancellation.abort();
      await vi.runAllTimersAsync();
      expect(await reading).toMatchObject({ name: "AbortError" });
      expect(
        chunks.some((chunk) => chunk.type === "tool-input-available"),
      ).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("honors an already aborted signal", async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const stream = await startTurn([userMessage("run")], cancellation.signal);
    await expect(stream.getReader().read()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("cancels pending typing when its reader closes", async () => {
    const stream = await startTurn([userMessage("run")]);
    const reader = stream.getReader();
    const chunks: UIMessageChunk[] = [];
    const reading = collect(reader, chunks);
    await vi.advanceTimersByTimeAsync(800);
    await reader.cancel();
    await vi.runAllTimersAsync();
    await reading;
    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "tool-input-available")).toBe(
      false,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
