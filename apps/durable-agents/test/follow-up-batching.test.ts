/**
 * Probe: does Pi Durable batch inputs that arrive while a run is busy, as
 * the DeepSeek Super-agent's Router batches Triggers? Three inputs are
 * submitted with `whenBusy: "followUp"` while the first run's tool call is
 * held open; the probe records which user messages each later model request
 * carries, under both `settings.followUpMode` values.
 */
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  type InputSubmissionDraft,
  MemoryStorage,
  type QueueMode,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { expect, test } from "vitest";

import { until } from "./browser-call/proof/server-process";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "./scripted-model";

import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const followUps = ["one", "two", "three"];

/** The user messages' texts of a request, in order. */
const userTexts: (...args: Parameters<FauxResponseFactory>) => string[] = (
  requestContext,
) =>
  requestContext.messages.flatMap((message) =>
    message.role !== "user"
      ? []
      : [
          typeof message.content === "string"
            ? message.content
            : message.content
                .map((part) => (part.type === "text" ? part.text : ""))
                .join(""),
        ],
  );

const runWith = async (followUpMode: QueueMode) => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const holdTool = defineTool({
    name: "hold",
    description: "Waits until the probe lets it finish.",
    parameters: obj({}),
    execute: async () => {
      await gate;
      return { output: [{ type: "text", text: "held" }] };
    },
  });
  // Each request after the tool call records its user messages and answers.
  const requests: string[][] = [];
  const answer: FauxResponseFactory = (requestContext, ...rest) => {
    requests.push(userTexts(requestContext, ...rest));
    return fauxAssistantMessage(`answer ${requests.length}`);
  };
  const { models, model } = scriptedModel([
    fauxAssistantMessage(fauxToolCall("hold", {}), { stopReason: "toolUse" }),
    ...Array.from({ length: 5 }, () => answer),
  ]);
  const registry = createRegistry();
  registry.install(defineExtension({ name: "probe-hold", tools: [holdTool] }));
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry, settings: { followUpMode } },
    context,
  );
  try {
    const root = await harness.root(context, { agent: { model } });
    const first = await root.submit(
      { type: "input", content: "start" },
      context,
    );
    await until(async () =>
      (await harness.inspect(context)).tasks.some(
        ({ record }) =>
          record.kind === "pi.tool" && record.state.status === "running",
      ),
    );
    const queued = await Promise.all(
      followUps.map((content) =>
        root.submit(
          {
            type: "input",
            content,
            whenBusy: "followUp",
          } satisfies InputSubmissionDraft,
          context,
        ),
      ),
    );
    open();
    const settled = await Promise.all(
      [first, ...queued].map(
        async (submission) => (await submission.wait(context)).status,
      ),
    );
    // What each request added to the user messages the one before it carried.
    const added = requests.map((texts, index) =>
      texts.slice(index === 0 ? 0 : requests[index - 1]!.length),
    );
    process.stdout.write(
      `followUpMode ${followUpMode}: ${requests.length} requests after the tool call; new user messages per request ${JSON.stringify(added)}\n`,
    );
    return { settled, added };
  } finally {
    await harness.close(context);
  }
};

test("followUpMode all places every queued input in one model request", async () => {
  const { settled, added } = await runWith("all");
  expect(settled).toEqual(["done", "done", "done", "done"]);
  expect(added).toEqual([["start"], followUps]);
});

test("followUpMode one-at-a-time places one queued input per model request", async () => {
  const { settled, added } = await runWith("one-at-a-time");
  expect(settled).toEqual(["done", "done", "done", "done"]);
  expect(added).toEqual([["start"], ["one"], ["two"], ["three"]]);
});
