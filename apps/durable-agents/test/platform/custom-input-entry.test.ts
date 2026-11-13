/**
 * P3: user input placed as a custom entry kind.
 *
 * `submit({ type: "input", content: userText, entry: { kind: "brunch.user",
 * data: submissionContext } })`: the model sees only `content`; the
 * submission context stays host data on the entry. This probe checks the
 * model's request, the server's AI SDK stream and reconnect over such an
 * entry, which `POST /chat` now admits, that the Ledger opens a turn on it,
 * and how a prompt section can read the submission context written beside
 * the admission.
 */
import {
  createRegistry,
  defineDoc,
  defineExtension,
  Harness,
  type JsonObject,
  MemoryStorage,
  section,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import {
  brunchTools,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import { createHostBinding } from "../../src/agent/host-binding";
import { createLedgerExtension, LedgerDoc } from "../../src/ledger";
import { drain, openMemoryServer, streamedText } from "./server";
import {
  allEntries,
  call,
  context,
  fauxAssistantMessage,
  holdTool,
  kindsOf,
  recordingModel,
  shapeOf,
} from "./support";

import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

const submissionContext: JsonObject = {
  interviewBudget: { questions: 3 },
  words: ["RelayDesk"],
};

const brunchUser = (content: string, data: JsonObject = submissionContext) =>
  ({
    type: "input",
    content,
    entry: { kind: "brunch.user", data },
  }) as const;

describe("P3: a custom input entry kind", () => {
  test("the model sees only the content; the entry keeps the submission context as data", async () => {
    const { models, model, requests } = recordingModel([
      fauxAssistantMessage("Hi."),
    ]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry() },
      context,
    );
    const root = await harness.root(context, { agent: { model } });
    const submission = await root.submit(brunchUser("Add a dryer."), context);
    const settled = await submission.wait(context);
    expect(settled.status).toBe("done");
    expect(shapeOf(requests[0]!)).toEqual(["user:Add a dryer."]);
    const [input] = await allEntries(root);
    expect(input).toMatchObject({
      kind: "brunch.user",
      data: submissionContext,
      model: [{ role: "user", content: "Add a dryer." }],
    });
    expect(settled.type === "input" && settled.entry).toBe(input?.id);
    await harness.close(context);
  });

  test("through the server: the reconnect stream follows a brunch.user input like any other", async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const slow: FauxResponseFactory = async () => {
      await gate;
      return fauxAssistantMessage("Second answer.");
    };
    const { models, model, requests } = recordingModel([
      fauxAssistantMessage("First answer."),
      slow,
    ]);
    const { server, transport, send, conversation } = openMemoryServer({
      models,
      model,
    });
    try {
      // The conversation exists after an ordinary POST /chat, which admits a brunch.user input.
      const first = await drain(await send("chat-1", "user-1", "Hello."));
      expect(streamedText(first)).toBe("First answer.");
      const { root } = await conversation("chat-1");
      // The panel's body: the user's text with its submission context.
      const posted = (
        await send(
          "chat-1",
          "user-2",
          petrinautContextualUserMessageBody({
            userText: "Add a dryer.",
            diagnosticsContext: "",
            submissionContext,
          }),
        )
      ).getReader();
      const reconnected = await transport.reconnectToStream({
        chatId: "chat-1",
      });
      expect(reconnected).not.toBeNull();
      open();
      const chunks = await drain(reconnected!);
      const postedStart = (await posted.read()).value;
      await posted.cancel();
      expect(chunks[0]).toEqual(postedStart);
      const start = chunks[0];
      expect(start?.type === "start" ? start.messageId : undefined).toMatch(
        /^durable:\d+$/,
      );
      expect(streamedText(chunks)).toBe("Second answer.");
      expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
      // No user message is streamed: AI SDK's client keeps its own.
      expect(JSON.stringify(chunks)).not.toContain("Add a dryer.");
      expect(shapeOf(requests[1]!).at(-1)).toBe("user:Add a dryer.");
      const entries = await allEntries(root);
      expect(kindsOf(entries)).toEqual([
        "brunch.user",
        "pi.system",
        "pi.assistant",
        "brunch.user",
        "pi.assistant",
      ]);
      expect(entries[3]?.data).toEqual({
        body: "contextual",
        userText: "Add a dryer.",
        submissionContext,
      });
    } finally {
      await server.close();
    }
  });

  test("the Ledger's turn counting opens a turn on pi.user and brunch.user alike", async () => {
    const turns = async (kind: "pi.user" | "brunch.user") => {
      const { models, model } = recordingModel([
        call(brunchTools.ledgerCommit, "commit-1", {
          entries: [
            [
              "entity/create",
              {
                name: "Dryer",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
          ],
        }),
        fauxAssistantMessage("Recorded."),
      ]);
      const host = createHostBinding();
      const registry = createRegistry();
      registry.install(createLedgerExtension(host));
      const harness = await Harness.open(
        new MemoryStorage(),
        { models, registry },
        context,
      );
      host.bind(harness);
      const root = await harness.root(context, { agent: { model } });
      const draft =
        kind === "pi.user"
          ? ({ type: "input", content: "There is one dryer." } as const)
          : brunchUser("There is one dryer.");
      await (await root.submit(draft, context)).wait(context);
      const ledger = await harness.snapshot(LedgerDoc, root.id, context);
      await harness.close(context);
      return ledger?.messages.filter(({ role }) => role === "user").length;
    };
    expect(await turns("pi.user")).toBe(1);
    expect(await turns("brunch.user")).toBe(1);
  });
});

/** The submission context the next request should see; written in the admitting commit. */
const SubmissionContextDoc = defineDoc<{ current: JsonObject | null }>({
  kind: "probe.submission-context",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ current: null }),
  checkpointWhen: () => false,
});

const contextSection = defineExtension({
  name: "probe.submission-context",
  sections: [
    section("submission_context", async (input, sectionContext) => {
      const doc = await input.read.snapshot(
        SubmissionContextDoc,
        input.conversationId,
        sectionContext,
      );
      return doc?.current === null || doc === undefined
        ? undefined
        : JSON.stringify(doc.current);
    }),
  ],
});

describe("P3: a prompt section reads the submission context from a document written with the admission", () => {
  test("submit(tx) and the document write in one commit: the run's first request shows it", async () => {
    const hold = holdTool();
    const { models, model, requests } = recordingModel([
      call("hold", "h1"),
      fauxAssistantMessage("First run answered."),
      fauxAssistantMessage("Second run answered."),
    ]);
    const registry = createRegistry();
    registry.install(contextSection);
    registry.install(
      defineExtension({ name: "probe-hold", tools: [hold.tool] }),
    );
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    const root = await harness.root(context, { agent: { model } });
    const admit = (content: string, data: JsonObject) =>
      harness.commit(async (tx) => {
        const id = await root.submit(tx, {
          ...brunchUser(content, data),
          whenBusy: "followUp",
        });
        const doc = await tx.doc(SubmissionContextDoc, root.id);
        doc.current = data;
        return id;
      }, context);
    const sectionOf = (index: number) =>
      requests[index]!.flatMap((message) =>
        message.role === "system" ? [message.sections?.submission_context] : [],
      );

    const firstId = await admit("Add a dryer.", { budget: 3 });
    await hold.started;
    // A follow-up queued while the first run works: its context lands in the document at once.
    const secondId = await admit("And a washer.", { budget: 2 });
    hold.release();
    for (const id of [firstId, secondId])
      // eslint-disable-next-line no-await-in-loop -- Settled in order.
      await (await harness.submission(id, context))!.wait(context);

    expect(sectionOf(0)).toEqual([
      '<submission_context>\n{"budget":3}\n</submission_context>',
    ]);
    // Caveat: the first run's request after its tool round already sees the queued follow-up's context,
    // as a positional system message after the round's result.
    expect(shapeOf(requests[1]!).slice(-2)).toEqual([
      "result:h1:held",
      "system:submission_context",
    ]);
    expect(sectionOf(1)).toEqual([
      '<submission_context>\n{"budget":3}\n</submission_context>',
      '<submission_context>\n{"budget":2}\n</submission_context>',
    ]);
    await harness.close(context);
  });
});
