/**
 * P6: prompt sections rendered from documents.
 *
 * An interview-budget section reads a counter document. Is a positional
 * `pi.system` entry written only when the rendered value changes, what does
 * the provider request contain, and do system entries (or a model-visible
 * host write, P7) leak into the server's AI SDK stream?
 */
import {
  createRegistry,
  defineDoc,
  defineExtension,
  Harness,
  MemoryStorage,
  section,
  SystemEntry,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import { drain, openMemoryServer, streamedText } from "./server";
import {
  allEntries,
  context,
  fauxAssistantMessage,
  recordingModel,
  shapeOf,
} from "./support";

const BudgetDoc = defineDoc<{ remaining: number }>({
  kind: "probe.interview-budget",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ remaining: 3 }),
  checkpointWhen: () => false,
});

const budgetExtension = defineExtension({
  name: "probe.budget",
  sections: [
    section("preamble", () => "You are Brunch.", { tag: false }),
    section("interview_budget", async (input, sectionContext) => {
      const budget = await input.read.snapshot(
        BudgetDoc,
        input.conversationId,
        sectionContext,
      );
      return `You may ask ${budget?.remaining ?? 3} more questions.`;
    }),
  ],
});

describe("P6: a section from a counter document", () => {
  test("a pi.system entry only when the rendered value changes; the request carries the leading prompt and then only the change", async () => {
    const { models, model, requests } = recordingModel([
      fauxAssistantMessage("one"),
      fauxAssistantMessage("two"),
      fauxAssistantMessage("three"),
    ]);
    const registry = createRegistry();
    registry.install(budgetExtension);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    try {
      const root = await harness.root(context, { agent: { model } });
      const ask = async (content: string) =>
        (await root.submit({ type: "input", content }, context)).wait(context);
      await ask("first");
      await ask("second");
      await root.commit(async (tx) => {
        const budget = await tx.doc(BudgetDoc, root.id);
        budget.remaining = 2;
      }, context);
      await ask("third");

      const systems = (await allEntries(root)).filter((entry) =>
        SystemEntry.is(entry),
      );
      expect(systems.map((entry) => entry.model?.[0])).toMatchObject([
        {
          role: "system",
          sections: {
            preamble: "You are Brunch.",
            interview_budget:
              "<interview_budget>\nYou may ask 3 more questions.\n</interview_budget>",
          },
        },
        {
          role: "system",
          sections: {
            interview_budget:
              "<interview_budget>\nYou may ask 2 more questions.\n</interview_budget>",
          },
        },
      ]);
      // The unchanged second request re-sends nothing; the third carries the change in place.
      expect(shapeOf(requests[1]!)).toEqual([
        "system:preamble,interview_budget",
        "user:first",
        "answer:one",
        "user:second",
      ]);
      expect(shapeOf(requests[2]!)).toEqual([
        "system:preamble,interview_budget",
        "user:first",
        "answer:one",
        "user:second",
        "answer:two",
        // Appended when the request is prepared: after the input it answers.
        "user:third",
        "system:interview_budget",
      ]);
      process.stdout.write(
        `P6 third request's system messages: ${JSON.stringify(requests[2]!.filter((message) => message.role === "system"))}\n`,
      );
    } finally {
      await harness.close(context);
    }
  });

  test("through the server: neither the section's system entries nor a model-visible host write reach the AI SDK stream", async () => {
    const { models, model } = recordingModel([
      fauxAssistantMessage("First answer."),
      fauxAssistantMessage("Second answer."),
    ]);
    const { server, send, conversation } = openMemoryServer({
      models,
      model,
      extensions: [budgetExtension],
    });
    try {
      const first = await drain(await send("chat-1", "user-1", "Hello."));
      const { root } = await conversation("chat-1");
      await root.commit(async (tx) => {
        const budget = await tx.doc(BudgetDoc, root.id);
        budget.remaining = 1;
      }, context);
      await root.submit(
        {
          type: "write",
          entry: {
            kind: "brunch.hand-edit",
            data: { revision: "revision-2" },
            model: [
              {
                role: "user",
                content: "The user edited the net by hand.",
                timestamp: 0,
              },
            ],
          },
        },
        context,
      );
      const second = await drain(await send("chat-1", "user-2", "Again."));
      for (const chunks of [first, second]) {
        const text = JSON.stringify(chunks);
        expect(text).not.toContain("interview_budget");
        expect(text).not.toContain("edited the net by hand");
        expect(new Set(chunks.map(({ type }) => type))).toEqual(
          new Set([
            "start",
            "start-step",
            "text-start",
            "text-delta",
            "text-end",
            "finish-step",
            "finish",
          ]),
        );
      }
      expect(streamedText(second)).toBe("Second answer.");
    } finally {
      await server.close();
    }
  });
});
