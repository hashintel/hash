/**
 * Candidate B: a host-authored, model-visible entry carrying the view, placed
 * before the first request after compaction through a supported API.
 *
 * Routes probed:
 * - B1: the `beforeCompact` hook admits a write through the Harness the host
 *   closes over (`HookApi` is read-only), while native summarization still
 *   runs. Admission places it at once when the conversation is idle, and at
 *   the next `postTools`/`final` boundary when a run is busy.
 * - B2: after a host-driven compaction completes, the host admits a write
 *   whose `edits` replace the summary head's messages with the summary plus
 *   the view, so the view sits at the head position.
 *
 * There is no hook after native placement, so no route admits a write in the
 * summary's own commit.
 */
import {
  CompactionTask,
  defineExtension,
  type Extension,
  hook,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import { allEntries, call, fauxAssistantMessage, kindsOf } from "../support";
import {
  compactionHead,
  committedContextBefore,
  context,
  filler,
  firstAnswerAfter,
  handEdit,
  type HarnessRef,
  lastVisibleView,
  netEvent,
  netText,
  openProbe,
  type Probe,
  prefixFromContext,
  restorePrefix,
} from "./support";

import type { Message } from "@earendil-works/pi-ai";

const r1 = { revision: "R1", structure: "places: Dryer" };

const restoreText = restorePrefix + netText(r1);

const restoreMessages = (messages: readonly Message[]) =>
  messages.filter(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.startsWith(restorePrefix),
  );

/** B1: the hook admits a restore write when the prefix ends in a view the kept tail does not decide. */
const restoreHook = (ref: HarnessRef, admitted: SubmissionId[]): Extension =>
  defineExtension({
    name: "probe.net-restore",
    hooks: [
      hook(CompactionTask, {
        beforeCompact: async (compaction, api, ctx) => {
          const state = lastVisibleView(compaction.messages);
          if (state?.kind !== "view") return undefined;
          const conversation = await ref.current!.conversation(
            api.conversationId,
            ctx,
          );
          const view = await conversation!.context(ctx);
          const kept = view.entries.flatMap((entry, index) =>
            entry.id >= compaction.firstKept ? view.contributions[index]! : [],
          );
          if (kept.some((message) => netEvent(message) !== undefined))
            return undefined;
          const submission = await conversation!.submit(
            {
              type: "write",
              // One per compaction task, so a rerun of the hook admits it once.
              requestId: `net-restore:${api.taskId}`,
              entry: {
                kind: "probe.net-restore",
                data: { revision: state.revision },
                model: [
                  {
                    role: "user",
                    content: restorePrefix + netText(state),
                    timestamp: 0,
                  },
                ],
              },
            },
            ctx,
          );
          admitted.push(submission.id);
          return undefined;
        },
      }),
    ],
  });

const openB1 = async (contextWindow?: number) => {
  const admitted: SubmissionId[] = [];
  const probe = await openProbe({
    browser: { current: r1 },
    contextWindow,
    extensions: (ref) => [restoreHook(ref, admitted)],
  });
  return { ...probe, admitted };
};

const readThenChat = async (probe: Probe) => {
  probe.model.script(
    call("readNet", "read-1"),
    fauxAssistantMessage("It has a dryer."),
    fauxAssistantMessage("Noted."),
  );
  await probe.ask("Look at the net.");
  await probe.ask("It dries clothes.");
};

const askAfterCompaction = async (probe: Probe, content: string) => {
  const head = await compactionHead(probe.root);
  probe.model.script(fauxAssistantMessage("OK."));
  const before = probe.model.requests.length;
  await probe.ask(content);
  const request = probe.model.requests[before]!;
  const answer = await firstAnswerAfter(probe.root, head.id);
  const committed = await committedContextBefore(probe.root, answer);
  return { head, request, committed, answer };
};

describe("control: native compaction alone", () => {
  test("the summary drops the view; the first request after compaction shows none", async () => {
    const probe = await openProbe({ browser: { current: r1 } });
    try {
      await readThenChat(probe);
      await probe.compact();
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      expect(lastVisibleView(request)).toBeUndefined();
    } finally {
      await probe.close();
    }
  });
});

describe("B1: the beforeCompact hook admits a restore write through the host's Harness", () => {
  test("1, 2, 9: idle manual compaction: placed at once, after firstKept and before the summary; the next request shows it, unrewritten", async () => {
    const probe = await openB1();
    try {
      await readThenChat(probe);
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { head, request, committed } = await askAfterCompaction(
        probe,
        "Add a second dryer.",
      );
      const [submission] = probe.admitted;
      const placed = (
        await (await probe.harness.submission(submission!, context))!.status(
          context,
        )
      ).entry!;
      // Kept verbatim: it lands after firstKept, before the summary entry.
      expect(placed).toBeGreaterThan(head.head!);
      expect(placed).toBeLessThan(head.id);
      expect(
        restoreMessages(request).map((message) => message.content),
      ).toEqual([restoreText]);
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
      expect(request).toEqual(committed);
      // Placement: after the kept tail, so two user messages in a row; one extra entry.
      process.stdout.write(
        `B1 entries after compaction: ${JSON.stringify(kindsOf((await allEntries(probe.root)).filter((entry) => entry.id >= head.head!)))}\n`,
      );
    } finally {
      await probe.close();
    }
  });

  test("1 fails: a blocking threshold compaction inside a run; the write queues to the run's next boundary, after the request it was for", async () => {
    const probe = await openB1(4000);
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage(filler("One.")),
        fauxAssistantMessage(filler("Two.")),
        fauxAssistantMessage(filler("Three.")),
      );
      await probe.ask("Look at the net.");
      await probe.ask("More.");
      await probe.ask("More still.");
      Object.assign(probe.compaction, {
        enabled: true,
        reserveTokens: 2000,
        keepRecentTokens: 1,
      });
      probe.model.script(fauxAssistantMessage("Added."));
      const before = probe.model.requests.length;
      await probe.ask("Add a second dryer.");
      probe.compaction.enabled = false;
      const head = await compactionHead(probe.root);
      expect(head.data).toEqual({ reason: "threshold" });
      const request = probe.model.requests[before]!;
      expect(restoreMessages(request)).toEqual([]);
      expect(lastVisibleView(request)).toBeUndefined();
      const answer = await firstAnswerAfter(probe.root, head.id);
      const placed = (
        await (await probe.harness.submission(
          probe.admitted[0]!,
          context,
        ))!.status(context)
      ).entry!;
      // Placed at the run's final boundary: after the answer to the request it was meant for.
      expect(placed).toBeGreaterThan(answer);
    } finally {
      await probe.close();
    }
  });

  test("3: the view is in the kept tail: the hook admits nothing", async () => {
    const probe = await openB1();
    try {
      probe.model.script(
        fauxAssistantMessage(filler("Hello.")),
        call("readNet", "read-1"),
        fauxAssistantMessage("It has a dryer."),
      );
      await probe.ask("Hello.");
      await probe.ask("Look at the net.");
      probe.compaction.keepRecentTokens = 300;
      await probe.compact();
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      expect(probe.admitted).toEqual([]);
      expect(
        request.filter((message) => netEvent(message)?.kind === "view"),
      ).toHaveLength(1);
    } finally {
      await probe.close();
    }
  });

  test("4: a hand edit after the view, both summarized: the hook admits nothing", async () => {
    const probe = await openB1();
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage("It has a dryer."),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      await probe.compact();
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      expect(probe.admitted).toEqual([]);
      expect(lastVisibleView(request)).toBeUndefined();
    } finally {
      await probe.close();
    }
  });

  test("6: a second compaction summarizes the first restore entry and restores again", async () => {
    const probe = await openB1();
    try {
      await readThenChat(probe);
      await probe.compact();
      await askAfterCompaction(probe, "Add a second dryer.");
      await probe.compact();
      const { request } = await askAfterCompaction(probe, "Go on.");
      expect(probe.admitted).toHaveLength(2);
      expect(restoreMessages(request)).toHaveLength(1);
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
    } finally {
      await probe.close();
    }
  });

  test("8: a hand edit admitted while the summary is generated lands after the restore entry, so it still invalidates", async () => {
    const probe = await openB1();
    try {
      await readThenChat(probe);
      let release = () => undefined as void;
      let entered = () => undefined as void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const summarizing = new Promise<void>((resolve) => {
        entered = resolve;
      });
      probe.model.control.summarize = async () => {
        entered();
        await gate;
        return fauxAssistantMessage("## Goal\nModel a laundry.");
      };
      const compaction = probe.compact();
      await summarizing;
      await handEdit(probe.root, "R2");
      release();
      await compaction;
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      expect(restoreMessages(request)).toHaveLength(1);
      expect(lastVisibleView(request)).toEqual({
        kind: "stale",
        revision: "R2",
      });
    } finally {
      await probe.close();
    }
  });

  test("7: a new Harness over the same storage after the compaction: the placed entry is ordinary history", async () => {
    const first = await openB1();
    let reopened: Probe | undefined;
    try {
      await readThenChat(first);
      await first.compact();
      await first.close();
      reopened = await openProbe({
        browser: { current: r1 },
        storage: first.storage,
        extensions: (ref) => [restoreHook(ref, [])],
      });
      const { request, committed } = await askAfterCompaction(
        reopened,
        "Add a dryer.",
      );
      expect(reopened.model.requests).toHaveLength(1);
      expect(restoreMessages(request)).toHaveLength(1);
      expect(request).toEqual(committed);
    } finally {
      await reopened?.close();
    }
  });

  test("hazard: the summarizer fails after the hook; the restore entry stays beside the original view", async () => {
    const probe = await openB1();
    try {
      await readThenChat(probe);
      probe.model.control.summarize = () =>
        fauxAssistantMessage("Partial", { stopReason: "length" });
      expect(await probe.compact()).toMatchObject({ status: "failed" });
      const { messages } = await probe.root.context(context);
      expect(
        messages.filter((message) => netEvent(message)?.kind === "view"),
      ).toHaveLength(2);
    } finally {
      await probe.close();
    }
  });
});

describe("B2: after a host-driven compaction, a host write edits the summary head to carry the view", () => {
  test("1, 2: idle manual compaction: the view sits at the head position in the next request", async () => {
    const probe = await openProbe({ browser: { current: r1 } });
    try {
      await readThenChat(probe);
      await probe.compact();
      const head = await compactionHead(probe.root);
      const state = await prefixFromContext(probe.root, head.id, context);
      expect(state).toEqual({ kind: "view", ...r1 });
      const write = await probe.root.submit(
        {
          type: "write",
          requestId: `net-restore:${head.id}`,
          entry: {
            kind: "probe.net-restore",
            edits: [
              {
                target: head.id,
                action: "replace",
                messages: [
                  ...head.model!,
                  { role: "user", content: restoreText, timestamp: 0 },
                ],
              },
            ],
          },
        },
        context,
      );
      expect(await write.status(context)).toMatchObject({ status: "done" });
      const { request, committed } = await askAfterCompaction(
        probe,
        "Add a second dryer.",
      );
      // Baseline system, summary, restore, then the kept tail.
      expect(request[2]).toMatchObject({ role: "user", content: restoreText });
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
      expect(request).toEqual(committed);
    } finally {
      await probe.close();
    }
  });
});
