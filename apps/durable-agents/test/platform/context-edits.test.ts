/**
 * P1 and P7: context edits and model-visible host writes in a busy or idle
 * conversation.
 *
 * - P1: can a running tool add a write carrying `edits` to its own busy
 *   conversation, where is it placed, and does the next request show the edit
 *   while the raw entries stay as they were?
 * - P7: a hand-edit notice, a write with a user `model` message and `data`,
 *   written while idle, while a tool round runs, and while the final answer
 *   streams: where is it placed, does it start a run, does the next request
 *   see it?
 */
import {
  createRegistry,
  defineExtension,
  defineTask,
  defineTool,
  type EntryDraft,
  type EntryRecord,
  Harness,
  LiveDoc,
  MemoryStorage,
  type Tx,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { describe, expect, test, vi } from "vitest";

import {
  allEntries,
  call,
  context,
  fauxAssistantMessage,
  holdTool,
  kindsOf,
  recordingModel,
  resultEntry,
  shapeOf,
} from "./support";

import type { Context } from "@earendil-works/chord";
import type { FauxResponseFactory } from "@earendil-works/pi-ai/providers/faux";

const firstTool = defineTool({
  name: "first",
  description: "Returns a fixed output.",
  parameters: obj({}),
  execute: async () => ({ output: [{ type: "text", text: "first output" }] }),
});

/** The newest `pi.tool-result` entry of `toolCallId`, read in a commit. */
const findResult = async (
  tx: Tx,
  conversationId: Parameters<Tx["scanEntries"]>[0]["conversationId"],
  toolCallId: string,
): Promise<EntryRecord> => {
  const page = await tx.scanEntries(
    { conversationId, order: "descending" },
    100,
  );
  const found = resultEntry(page.items, toolCallId);
  if (found === undefined) throw new Error(`No result for ${toolCallId}.`);
  return found;
};

/** A write that replaces `target`'s result with `text`, as a fold would drop an earlier read-back. */
const replaceResult = (target: EntryRecord, text: string): EntryDraft => {
  const message = target.model?.[0];
  if (message?.role !== "toolResult") throw new Error("Not a tool result.");
  return {
    kind: "probe.edit",
    data: { replaced: target.id },
    edits: [
      {
        target: target.id,
        action: "replace",
        messages: [{ ...message, content: [{ type: "text", text }] }],
      },
    ],
  };
};

type EditPath = "submit" | "appendEntry" | "child-task";

/** Commits a task that, in its terminal commit, admits the edit write: a stand-in for `BrowserCall`'s `collect`. */
const EditingTask = defineTask<{ toolCallId: string }, { phase: "edit" }, null>(
  {
    name: "probe.editing-task",
    version: 1,
    initial: () => ({ phase: "edit" }),
    phases: {
      edit: async (task, runtime, taskContext) => {
        const handle = await runtime.conversation(
          runtime.conversationId,
          taskContext,
        );
        if (handle === undefined) throw new Error("No conversation.");
        await runtime.commit(async (tx) => {
          const target = await findResult(
            tx,
            runtime.conversationId,
            task.input.toolCallId,
          );
          await handle.submit(tx, {
            type: "write",
            entry: replaceResult(target, "first output (edited)"),
          });
          return {
            status: "terminal",
            outcome: { status: "completed", result: null },
          };
        }, taskContext);
      },
    },
    abort: (_task, runtime, taskContext) =>
      runtime.commit(
        () => ({ status: "terminal", outcome: { status: "aborted" } }),
        taskContext,
      ),
  },
);

/** A tool that edits call `c1`'s result out of the model's view, by `path`. */
const editorTool = (path: EditPath) =>
  defineTool({
    name: "editor",
    description: "Replaces the first tool's result in the model's view.",
    parameters: obj({}),
    execute: async (_args, api, toolContext: Context) => {
      const { conversationId } = api;
      if (path === "child-task") {
        const task = await api.createTask(
          EditingTask,
          { toolCallId: "c1" },
          { ownership: { kind: "task", taskId: api.taskId } },
          toolContext,
        );
        await api.waitForTask(task, toolContext);
      } else if (path === "appendEntry") {
        await api.commit(async (tx) => {
          const target = await findResult(tx, conversationId, "c1");
          await tx.appendEntry(
            conversationId,
            replaceResult(target, "first output (edited)"),
          );
        }, toolContext);
      } else {
        // The handle is a Harness read: taken before the commit, which holds the line.
        const handle = await api.conversation(conversationId, toolContext);
        if (handle === undefined) throw new Error("No conversation.");
        // Twice with one request ID, as a replay-safe rerun would: one write.
        for (const attempt of [1, 2]) {
          // eslint-disable-next-line no-await-in-loop -- Each attempt is its own commit, in order.
          await api.commit(async (tx) => {
            const target = await findResult(tx, conversationId, "c1");
            await handle.submit(tx, {
              type: "write",
              requestId: `edit:${api.callId}`,
              entry: replaceResult(target, `first output (edited)`),
            });
            return attempt;
          }, toolContext);
        }
      }
      return { output: [{ type: "text", text: "editor output" }] };
    },
  });

const runEditRound = async (path: EditPath) => {
  const { models, model, requests } = recordingModel([
    call("first", "c1"),
    call("editor", "c2"),
    fauxAssistantMessage("done"),
  ]);
  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "probe-edits",
      tools: [firstTool, editorTool(path)],
      tasks: [EditingTask],
    }),
  );
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  try {
    const root = await harness.root(context, { agent: { model } });
    const submission = await root.submit(
      { type: "input", content: "go" },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    const entries = await allEntries(root);
    const view = await root.context(context);
    return { entries, requests, view };
  } finally {
    await harness.close(context);
  }
};

describe("P1: context edits from a running tool", () => {
  test("a write with edits admitted by the tool through api.conversation lands after the round's results, and the next request shows the edit", async () => {
    const { entries, requests, view } = await runEditRound("submit");
    // One write for two admissions under one request ID; placed at the post-tools boundary.
    expect(kindsOf(entries)).toEqual([
      "pi.user",
      "pi.system",
      "pi.assistant(c1)",
      "pi.tool-result(c1)",
      "pi.assistant(c2)",
      "pi.tool-result(c2)",
      "probe.edit",
      "pi.assistant",
    ]);
    const edit = entries.find(({ kind }) => kind === "probe.edit");
    // The write carries the tool task's ID.
    expect(edit?.byTaskId).toBeDefined();
    // The request before the edit saw the original; the one after sees the replacement.
    expect(shapeOf(requests[1]!)).toContain("result:c1:first output");
    expect(shapeOf(requests[2]!)).toEqual([
      "system:",
      "user:go",
      "call:c1",
      "result:c1:first output (edited)",
      "call:c2",
      "result:c2:editor output",
    ]);
    // Raw history is unchanged; the edit applies to the derived context only.
    expect(resultEntry(entries, "c1")?.model?.[0]).toMatchObject({
      content: [{ type: "text", text: "first output" }],
    });
    expect(shapeOf(view.messages)).toContain("result:c1:first output (edited)");
  });

  test("tx.appendEntry from the tool's own commit lands mid-round, between the call and its result, and still edits the next request", async () => {
    const { entries, requests } = await runEditRound("appendEntry");
    expect(kindsOf(entries)).toEqual([
      "pi.user",
      "pi.system",
      "pi.assistant(c1)",
      "pi.tool-result(c1)",
      "pi.assistant(c2)",
      "probe.edit",
      "pi.tool-result(c2)",
      "pi.assistant",
    ]);
    expect(shapeOf(requests[2]!)).toContain("result:c1:first output (edited)");
  });

  test("a task the tool waits on can admit the edit in its terminal commit, placed at the same boundary", async () => {
    const { entries, requests } = await runEditRound("child-task");
    expect(kindsOf(entries)).toEqual([
      "pi.user",
      "pi.system",
      "pi.assistant(c1)",
      "pi.tool-result(c1)",
      "pi.assistant(c2)",
      "pi.tool-result(c2)",
      "probe.edit",
      "pi.assistant",
    ]);
    expect(shapeOf(requests[2]!)).toContain("result:c1:first output (edited)");
  });
});

const handEditNotice = (revision: string): EntryDraft => ({
  kind: "brunch.hand-edit",
  data: { revision },
  model: [
    {
      role: "user",
      content:
        "The user edited the net by hand; read it again before changing it.",
      timestamp: 0,
    },
  ],
});

describe("P7: a hand-edit notice as a host write", () => {
  test("written while idle: placed at once, starts no run, and the next request carries it before the user's message", async () => {
    const { models, model, requests } = recordingModel([
      fauxAssistantMessage("first answer"),
      fauxAssistantMessage("second answer"),
    ]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry() },
      context,
    );
    try {
      const root = await harness.root(context, { agent: { model } });
      await (
        await root.submit({ type: "input", content: "hello" }, context)
      ).wait(context);
      const write = await root.submit(
        { type: "write", entry: handEditNotice("revision-2") },
        context,
      );
      const placed = await write.status(context);
      expect(placed.status).toBe("done");
      // No run started: nothing running, no model request.
      await root.waitForIdle(context);
      expect(
        (await harness.snapshot(LiveDoc, root.id, context))?.run,
      ).toBeUndefined();
      expect(requests).toHaveLength(1);
      expect(kindsOf(await allEntries(root)).at(-1)).toBe("brunch.hand-edit");

      await (
        await root.submit({ type: "input", content: "next" }, context)
      ).wait(context);
      // No tools and no sections: no system message.
      expect(shapeOf(requests[1]!)).toEqual([
        "user:hello",
        "answer:first answer",
        "user:The user edited the net by hand; read it again before changing it.",
        "user:next",
      ]);
    } finally {
      await harness.close(context);
    }
  });

  test("written during a tool round: queued, placed after the round's results, seen by the run's next request, no second run", async () => {
    const hold = holdTool();
    const { models, model, requests } = recordingModel([
      call("hold", "h1"),
      fauxAssistantMessage("answer"),
    ]);
    const registry = createRegistry();
    registry.install(
      defineExtension({ name: "probe-hold", tools: [hold.tool] }),
    );
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry },
      context,
    );
    try {
      const root = await harness.root(context, { agent: { model } });
      const input = await root.submit(
        { type: "input", content: "go" },
        context,
      );
      await hold.started;
      const write = await root.submit(
        { type: "write", entry: handEditNotice("revision-2") },
        context,
      );
      expect((await write.status(context)).status).toBe("queued");
      hold.release();
      expect((await input.wait(context)).status).toBe("done");
      expect((await write.status(context)).status).toBe("done");
      expect(kindsOf(await allEntries(root))).toEqual([
        "pi.user",
        "pi.system",
        "pi.assistant(h1)",
        "pi.tool-result(h1)",
        "brunch.hand-edit",
        "pi.assistant",
      ]);
      expect(requests).toHaveLength(2);
      expect(shapeOf(requests[1]!).at(-1)).toBe(
        "user:The user edited the net by hand; read it again before changing it.",
      );
    } finally {
      await harness.close(context);
    }
  });

  test("written while the final answer streams: placed after the answer, and starts no further run", async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    let answering: () => void = () => undefined;
    const answerStarted = new Promise<void>((resolve) => {
      answering = resolve;
    });
    const slowAnswer: FauxResponseFactory = async () => {
      answering();
      await gate;
      return fauxAssistantMessage("answer");
    };
    const { models, model, requests } = recordingModel([slowAnswer]);
    const harness = await Harness.open(
      new MemoryStorage(),
      { models, registry: createRegistry() },
      context,
    );
    try {
      const root = await harness.root(context, { agent: { model } });
      const input = await root.submit(
        { type: "input", content: "go" },
        context,
      );
      await answerStarted;
      const write = await root.submit(
        { type: "write", entry: handEditNotice("revision-3") },
        context,
      );
      expect((await write.status(context)).status).toBe("queued");
      open();
      expect((await input.wait(context)).status).toBe("done");
      await root.waitForIdle(context);
      await vi.waitFor(async () =>
        expect((await write.status(context)).status).toBe("done"),
      );
      expect(kindsOf(await allEntries(root))).toEqual([
        "pi.user",
        "pi.assistant",
        "brunch.hand-edit",
      ]);
      expect(requests).toHaveLength(1);
      expect(
        (await harness.snapshot(LiveDoc, root.id, context))?.run,
      ).toBeUndefined();
    } finally {
      await harness.close(context);
    }
  });
});
