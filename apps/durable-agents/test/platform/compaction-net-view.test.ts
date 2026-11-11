/**
 * P4: does a net view survive compaction?
 *
 * A `beforeCompact` hook reads the net the model last saw from a document
 * (`HookApi` reads documents) and writes it, with its revision, into the
 * summary. The freshness rule, derived from `context({ at })`, then counts a
 * compaction summary at the head of the context as a view at the revision
 * the summary names. The compaction entry's own `data` cannot carry it: the
 * hook returns only the summary text.
 *
 * Stand-in tools: `readNet` shows the net and records it in `NetViewDoc`;
 * `changeNet` is refused unless the model's context at its call shows the
 * net, by a read's result or by such a summary.
 */
import {
  CompactionEntry,
  CompactionTask,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  type EntryRecord,
  Harness,
  hook,
  MemoryStorage,
  type ToolTaskInput,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { describe, expect, test } from "vitest";

import {
  call,
  context,
  fauxAssistantMessage,
  recordingModel,
  shapeOf,
  textOf,
} from "./support";

import type { Message } from "@earendil-works/pi-ai";

/** The net as the model last saw it. */
const NetViewDoc = defineDoc<{ revision: string | null; structure: string }>({
  kind: "probe.net-view",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ revision: null, structure: "" }),
  checkpointWhen: () => false,
});

const net = { revision: "revision-1", structure: "places: Dryer" };

const viewMarker = /<net-view revision="([^"]+)">/u;

/** The summary text a compaction gets when the hook knows the net view. */
const summaryWithView = (view: { revision: string; structure: string }) =>
  `We are modelling a laundry.\n<net-view revision="${view.revision}">\n${view.structure}\n</net-view>`;

/**
 * The revision the model's context shows: the compaction summary heading it,
 * when that summary names one, then any later read.
 */
const revisionInContext = (
  head: EntryRecord | undefined,
  messages: readonly Message[],
): string | undefined => {
  let revision: string | undefined;
  if (CompactionEntry.is(head))
    revision = viewMarker.exec(textOf(head.model?.[0]))?.[1];
  for (const message of messages)
    if (
      message.role === "toolResult" &&
      message.toolName === "readNet" &&
      !message.isError
    )
      revision =
        (message.details as { revision?: string } | undefined)?.revision ??
        revision;
  return revision;
};

const refusal = "Not started: no current view of the net is in your context.";

const setup = () => {
  const harnessRef: { current?: Harness } = {};
  const decisions: { reason: string; summarized: number }[] = [];
  const readNet = defineTool({
    name: "readNet",
    description: "Read the net.",
    parameters: obj({}),
    execute: async (_args, api, toolContext) => {
      await api.commit(async (tx) => {
        Object.assign(await tx.doc(NetViewDoc, api.conversationId), net);
      }, toolContext);
      return {
        output: [{ type: "text", text: net.structure }],
        details: { revision: net.revision },
      };
    },
  });
  const changeNet = defineTool({
    name: "changeNet",
    description: "Change the net.",
    parameters: obj({}),
    execute: async (_args, api, toolContext) => {
      const input = (await api.getTask(api.taskId, toolContext))
        ?.input as ToolTaskInput;
      if (input.kind !== "model") throw new Error("Not a model call.");
      const conversation = await harnessRef.current!.conversation(
        api.conversationId,
        toolContext,
      );
      const { head, messages } = await conversation!.context(toolContext, {
        at: input.assistant,
      });
      const revision = revisionInContext(head, messages);
      return revision === undefined
        ? { output: [{ type: "text", text: refusal }], isError: true }
        : {
            output: [{ type: "text", text: "Changed." }],
            details: { expectedRevision: revision },
          };
    },
  });
  const extension = defineExtension({
    name: "probe.net",
    tools: [readNet, changeNet],
    hooks: [
      hook(CompactionTask, {
        beforeCompact: async (compaction, api, hookContext) => {
          decisions.push({
            reason: compaction.reason,
            summarized: compaction.entries.length,
          });
          const view = await api.snapshot(
            NetViewDoc,
            api.conversationId,
            hookContext,
          );
          return {
            summary:
              view?.revision === null || view === undefined
                ? "We are modelling a laundry."
                : summaryWithView({
                    revision: view.revision,
                    structure: view.structure,
                  }),
          };
        },
      }),
    ],
  });
  return { harnessRef, decisions, extension };
};

const runCompacted = async (readsFirst: boolean) => {
  const { harnessRef, decisions, extension } = setup();
  const { models, model, requests } = recordingModel([
    ...(readsFirst
      ? [call("readNet", "read-1"), fauxAssistantMessage("It has a dryer.")]
      : [fauxAssistantMessage("Hello.")]),
    fauxAssistantMessage("Noted."),
    call("changeNet", "change-1"),
    fauxAssistantMessage("Done, or refused."),
  ]);
  const registry = createRegistry();
  registry.install(extension);
  const harness = await Harness.open(
    new MemoryStorage(),
    // Keep almost nothing verbatim, so the compaction cuts the read away.
    { models, registry, settings: { compaction: { keepRecentTokens: 1 } } },
    context,
  );
  harnessRef.current = harness;
  try {
    const root = await harness.root(context, { agent: { model } });
    for (const content of ["Look at the net.", "It dries clothes."]) {
      // eslint-disable-next-line no-await-in-loop -- Turns run in order.
      await (
        await root.submit({ type: "input", content }, context)
      ).wait(context);
    }
    const task = await root.compact(undefined, context);
    expect(
      (await harness.waitForTask(task, context)).state.outcome.status,
    ).toBe("completed");
    const compacted = await root.context(context);
    await (
      await root.submit(
        { type: "input", content: "Add a second dryer." },
        context,
      )
    ).wait(context);
    const after = await root.context(context);
    const changeResult = after.messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === "change-1",
    );
    return { compacted, changeResult, decisions, requests };
  } finally {
    await harness.close(context);
  }
};

describe("P4: a net view survives compaction through the summary", () => {
  test("a manual compaction cuts the read away; the hook's summary carries the view; the change is admitted at the read's revision", async () => {
    const { compacted, changeResult, decisions, requests } =
      await runCompacted(true);
    // Everything but the last answer: user, system, call, result, answer, user.
    expect(decisions).toEqual([{ reason: "manual", summarized: 6 }]);
    // The read's result is no longer in the context; the summary heads it.
    expect(compacted.head?.kind).toBe("pi.compaction");
    expect(
      shapeOf(compacted.messages).some((shape) =>
        shape.startsWith("result:read-1"),
      ),
    ).toBe(false);
    // The compaction entry's data is the Harness's own; the hook cannot add to it.
    expect(compacted.head?.data).toEqual({ reason: "manual" });
    // The model's next request starts from the summary, the net view inside it.
    expect(
      textOf(requests.at(-2)!.find((message) => message.role === "user")),
    ).toContain('<net-view revision="revision-1">');
    expect(changeResult).toMatchObject({
      isError: false,
      details: { expectedRevision: "revision-1" },
    });
  });

  test("a conversation that never read the net: the summary carries no view, and the change is refused", async () => {
    const { compacted, changeResult } = await runCompacted(false);
    expect(compacted.head?.kind).toBe("pi.compaction");
    expect(textOf(compacted.head?.model?.[0])).not.toContain("<net-view");
    expect(changeResult).toMatchObject({
      isError: true,
      content: [{ type: "text", text: refusal }],
    });
  });
});
