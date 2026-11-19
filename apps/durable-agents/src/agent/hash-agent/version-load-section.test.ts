/**
 * The `version_load` section on a real Harness with a faux model, over
 * admissions that record loads as `POST /chat` does: a compaction restates it
 * in the baseline Pi writes after the head, and a fork shows the loads of its
 * own history only. One delta per load and the busy-run bound are covered
 * through the route, in `durable-agents-server.test.ts`.
 */
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai/providers/faux";
import {
  CompactionEntry,
  type Conversation,
  createRegistry,
  type EntryId,
  Harness,
  MemoryStorage,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import {
  petrinautContextualUserMessageBody,
  type VersionLoad,
  versionLoadSectionText,
} from "@hashintel/brunch-agent";

import { context, textOf } from "../../../test/platform/support";
import { brunchUserInput } from "../../server/durable-agents-server/user-input";
import { versionLoadRecorder } from "../../server/durable-agents-server/version-load";
import {
  versionLoadSectionExtension,
  versionLoadSectionKey,
  VersionLoadsDoc,
} from "./version-load-section";

import type { Message } from "@earendil-works/pi-ai";

const load1 = { id: "version-1", decisionTime: "2026-11-12T09:30:00.000Z" };

const tagged = (load: VersionLoad) =>
  `<${versionLoadSectionKey}>\n${versionLoadSectionText(load)}\n</${versionLoadSectionKey}>`;

/** The `version_load` section in effect after replaying the messages' patches, as Pi replays them. */
const shownSection = (messages: readonly Message[]) => {
  let shown: string | undefined;
  for (const message of messages) {
    if (message.role !== "system") continue;
    const value = message.sections?.[versionLoadSectionKey];
    if (value === null) shown = undefined;
    else if (value !== undefined) shown = value;
  }
  return shown;
};

/** A long answer, so a compaction has something to cut. */
const filler = (label: string) =>
  `${label} ${"The laundry runs on a schedule. ".repeat(120)}`;

const summarizerPrompt = "You are a context summarization assistant.";

const isSummarization = (messages: readonly Message[]) => {
  const [first] = messages;
  return (
    first?.role === "system" &&
    typeof first.content === "string" &&
    first.content.startsWith(summarizerPrompt)
  );
};

/** Conversation requests are recorded and answered at length; summaries are recorded apart. */
const recordingModel = () => {
  const requests: Message[][] = [];
  const summaries: Message[][] = [];
  const faux = fauxProvider();
  const respond: FauxResponseFactory = async (requestContext) => {
    const messages = structuredClone(requestContext.messages);
    if (isSummarization(messages)) {
      summaries.push(messages);
      return fauxAssistantMessage("## Goal\nModel a laundry.");
    }
    requests.push(messages);
    return fauxAssistantMessage(filler(`Answer ${requests.length}.`));
  };
  faux.setResponses(Array.from({ length: 50 }, () => respond));
  const models = createModels();
  models.setProvider(faux.provider);
  const model: ModelRef = {
    provider: faux.provider.id,
    modelId: faux.getModel().id,
  };
  return { models, model, requests, summaries };
};

const open = async () => {
  const model = recordingModel();
  const registry = createRegistry();
  registry.install(versionLoadSectionExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    {
      models: model.models,
      registry,
      settings: () => ({
        compaction: {
          enabled: false,
          keepRecentTokens: 1,
          reserveTokens: 16_384,
          backgroundTokens: 0,
        },
      }),
    },
    context,
  );
  const root = await harness.root(context, {
    agent: { model: model.model, extensions: [versionLoadSectionExtension] },
  });

  /** Admit `words` in `conversation` as `POST /chat` does, with `load` if given, and wait for its answer; returns its request. */
  const ask = async (
    conversation: Conversation,
    words: string,
    load?: VersionLoad,
  ) => {
    const input = brunchUserInput(
      load === undefined
        ? words
        : petrinautContextualUserMessageBody({
            userText: words,
            diagnosticsContext: "",
            submissionContext: { versionLoad: load },
          }),
    );
    const record = await versionLoadRecorder(
      harness,
      conversation.id,
      input,
      context,
    );
    const id = await conversation.commit(async (tx) => {
      const submitted = await conversation.submit(tx, {
        type: "input",
        content: input.content,
        entry: input.entry,
      });
      await record(tx, submitted);
      return submitted;
    }, context);
    const submission = await harness.submission(id, context);
    expect((await submission?.wait(context))?.status).toBe("done");
    const request = model.requests.at(-1);
    if (request === undefined) throw new Error("No request.");
    return request;
  };

  const newestEntry = async (conversation: Conversation) => {
    const [entry] = (
      await conversation.entries({ order: "descending" }, 1, undefined, context)
    ).items;
    if (entry === undefined) throw new Error("No entry.");
    return entry.id;
  };

  const fork = (at: EntryId) =>
    root.fork(at, { ownership: { kind: "ownerless" } }, context);

  return {
    harness,
    root,
    model,
    ask,
    newestEntry,
    fork,
    close: () => harness.close(context),
  };
};

describe("the version_load section", () => {
  test("a compaction restates the load in the baseline after its head, though the summary never saw it", async () => {
    const probe = await open();
    try {
      await probe.ask(probe.root, "Add a dryer.", load1);
      await probe.ask(probe.root, "And a washer.", load1);
      const task = await probe.root.compact(undefined, context);
      expect(
        (await probe.harness.waitForTask(task, context)).state.outcome,
      ).toMatchObject({ status: "completed" });
      const { head } = await probe.root.context(context);
      expect(CompactionEntry.is(head)).toBe(true);

      const request = await probe.ask(probe.root, "Now a press.", load1);
      expect(
        request.some(
          (message) =>
            message.role === "user" && textOf(message) === "Add a dryer.",
        ),
      ).toBe(false);
      expect(request[0]).toMatchObject({
        role: "system",
        sections: { [versionLoadSectionKey]: tagged(load1) },
      });
      expect(shownSection(request)).toBe(tagged(load1));
      expect(probe.model.summaries).toHaveLength(1);
      expect(JSON.stringify(probe.model.summaries[0])).not.toContain(
        versionLoadSectionText(load1),
      );
    } finally {
      await probe.close();
    }
  });

  test("a fork made before the load shows none; one made after it shows it", async () => {
    const probe = await open();
    try {
      await probe.ask(probe.root, "Add a dryer.");
      const beforeLoad = await probe.newestEntry(probe.root);
      expect(
        shownSection(await probe.ask(probe.root, "And a washer.", load1)),
      ).toBe(tagged(load1));
      const afterLoad = await probe.newestEntry(probe.root);

      const early = await probe.fork(beforeLoad);
      expect(
        (await probe.harness.snapshot(VersionLoadsDoc, early.id, context))
          ?.loads ?? [],
      ).toEqual([]);
      expect(
        shownSection(await probe.ask(early, "Now a press.")),
      ).toBeUndefined();

      const late = await probe.fork(afterLoad);
      expect(shownSection(await probe.ask(late, "Now a press."))).toBe(
        tagged(load1),
      );
    } finally {
      await probe.close();
    }
  });
});
